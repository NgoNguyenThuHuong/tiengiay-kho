#!/usr/bin/env python3
"""Idempotently import the offline inventory export into Supabase and Cloudflare R2."""

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent.parent
EXPORT_DIR = ROOT / "data" / "export"
PRODUCTS_CSV = EXPORT_DIR / "products.csv"
IMAGES_CSV = EXPORT_DIR / "product_images.csv"
BATCH_SIZE = 100
REQUIRED_ENV = (
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
)


class ImportFailure(Exception):
    pass


def parse_env_file(path):
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export ") :].lstrip()
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def load_config():
    values = parse_env_file(ROOT / ".env")
    for key in REQUIRED_ENV:
        if key not in values and key in os.environ:
            values[key] = os.environ[key]

    missing = [key for key in REQUIRED_ENV if not values.get(key, "").strip()]
    if missing:
        raise ImportFailure(
            "Missing required .env settings: " + ", ".join(missing)
        )
    return values


def read_csv(path, expected_fields):
    if not path.is_file():
        raise ImportFailure(f"Export file not found: {path.relative_to(ROOT)}")
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != list(expected_fields):
            raise ImportFailure(f"Unexpected columns in {path.name}")
        return list(reader)


def safe_object_key(value):
    key = PurePosixPath(value)
    if key.is_absolute() or not key.parts or any(part in ("", ".", "..") for part in key.parts):
        raise ImportFailure("Invalid object key in product_images.csv")
    return key.as_posix()


def load_export(limit):
    sys.path.insert(0, str(ROOT / "scraper"))
    from categories import CATEGORY_SLUGS

    product_fields = (
        "sku",
        "slug",
        "name",
        "price_vnd",
        "price_text",
        "description",
        "source_url",
        "category_slug",
        "needs_photos",
    )
    image_fields = ("slug", "position", "file", "source_url", "width", "height")
    products = read_csv(PRODUCTS_CSV, product_fields)
    all_images = read_csv(IMAGES_CSV, image_fields)
    if limit is not None:
        products = products[:limit]
    if not products:
        raise ImportFailure("The selected product export is empty")

    products_by_slug = {}
    sku_values = set()
    for product in products:
        slug = product["slug"]
        if not slug or slug in products_by_slug:
            raise ImportFailure("Product slugs must be non-empty and unique")
        if not product["name"].strip():
            raise ImportFailure(f"Missing product name for {slug or 'row'}")
        if not re.fullmatch(r"TG-[0-9]{5,}", product["sku"]):
            raise ImportFailure(f"Invalid generated SKU for product {slug}")
        if product["sku"] in sku_values:
            raise ImportFailure("Product SKUs must be unique")
        if product["needs_photos"] not in ("true", "false"):
            raise ImportFailure(f"Invalid needs_photos value for product {slug}")
        if product["price_vnd"]:
            try:
                product["price_vnd"] = int(product["price_vnd"])
            except ValueError as exc:
                raise ImportFailure(f"Invalid numeric price for product {slug}") from exc
            if product["price_vnd"] < 0:
                raise ImportFailure(f"Negative price for product {slug}")
        else:
            product["price_vnd"] = None
        product["needs_photos"] = product["needs_photos"] == "true"
        product["category_slug"] = product["category_slug"].strip()
        if not product["category_slug"]:
            raise ImportFailure(f"Missing category for product {slug}")
        if product["category_slug"] not in CATEGORY_SLUGS:
            raise ImportFailure(f"Unknown category for product {slug}")
        products_by_slug[slug] = product
        sku_values.add(product["sku"])

    selected_slugs = set(products_by_slug)
    images = [
        image for image in all_images
        if image["slug"] in selected_slugs
    ]
    positions = set()
    keys = set()
    for image in images:
        slug = image["slug"]
        image["position"] = int(image["position"])
        image["width"] = int(image["width"])
        image["height"] = int(image["height"])
        if image["position"] < 0 or min(image["width"], image["height"]) <= 0:
            raise ImportFailure(f"Invalid image metadata for product {slug}")
        if max(image["width"], image["height"]) > 1600:
            raise ImportFailure(f"Image exceeds 1600 pixels for product {slug}")
        key = safe_object_key(image["file"])
        image["file"] = key
        if key in keys or (slug, image["position"]) in positions:
            raise ImportFailure("Image object keys and product positions must be unique")
        keys.add(key)
        positions.add((slug, image["position"]))
        local_file = EXPORT_DIR.joinpath(*PurePosixPath(key).parts)
        if not local_file.is_file():
            raise ImportFailure(f"Export image file is missing: {key}")
        try:
            with Image.open(local_file) as decoded:
                image_format = decoded.format
                size = decoded.size
                decoded.verify()
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
            raise ImportFailure(f"Export image failed validation: {key}") from exc
        if image_format != "WEBP" or size != (image["width"], image["height"]):
            raise ImportFailure(f"Export image metadata does not match: {key}")

    images_by_slug = {}
    for image in images:
        images_by_slug.setdefault(image["slug"], []).append(image)
    for slug, product in products_by_slug.items():
        expected = len(images_by_slug.get(slug, [])) < 2
        if product["needs_photos"] != expected:
            raise ImportFailure(f"needs_photos does not match image count for {slug}")

    category_slugs = {product["category_slug"] for product in products}
    return products, images, category_slugs


def print_dry_run(products, images, category_slugs):
    print("Dry run: no .env values loaded, network requests made, or remote writes performed.")
    print(f"Products in scope: {len(products)}")
    print(f"Categories in scope: {len(category_slugs)}")
    print(f"WebP images in scope: {len(images)}")
    print(
        "WebP bytes in scope: "
        f"{sum((EXPORT_DIR / image['file']).stat().st_size for image in images)}"
    )
    print(
        "Products needing photos: "
        f"{sum(product['needs_photos'] for product in products)}"
    )


def build_supabase_session(config):
    import requests

    session = requests.Session()
    session.headers.update(
        {
            "apikey": config["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {config['SUPABASE_SERVICE_ROLE_KEY']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
    )
    return session


def supabase_request(session, config, table_or_rpc, *, params=None, payload=None, prefer=None, is_rpc=False):
    base = config["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
    endpoint = base + ("rpc/" if is_rpc else "") + table_or_rpc
    headers = {"Prefer": prefer} if prefer else {}
    try:
        response = session.request(
            "POST" if payload is not None else "GET",
            endpoint,
            params=params,
            json=payload,
            headers=headers,
            timeout=(10, 60),
        )
    except Exception as exc:
        raise ImportFailure(
            f"Supabase request failed for {table_or_rpc} ({type(exc).__name__})"
        ) from None
    if not response.ok:
        raise ImportFailure(
            f"Supabase request failed for {table_or_rpc}: HTTP {response.status_code}"
        )
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise ImportFailure(f"Supabase returned invalid JSON for {table_or_rpc}") from exc


def chunks(values, size=BATCH_SIZE):
    for start in range(0, len(values), size):
        yield values[start : start + size]


def upsert_rows(session, config, table, rows, conflict_columns):
    if not rows:
        return
    for batch in chunks(rows):
        supabase_request(
            session,
            config,
            table,
            params={"on_conflict": conflict_columns},
            payload=batch,
            prefer="resolution=merge-duplicates,return=minimal",
        )


def fetch_by_slugs(session, config, table, slugs):
    found = {}
    for batch in chunks(sorted(slugs), 100):
        encoded = ",".join(json.dumps(slug, ensure_ascii=False) for slug in batch)
        rows = supabase_request(
            session,
            config,
            table,
            params={"select": "id,slug", "slug": f"in.({encoded})"},
        )
        for row in rows or []:
            found[row["slug"]] = row["id"]
    missing = set(slugs) - set(found)
    if missing:
        raise ImportFailure(f"Supabase is missing {len(missing)} expected {table} rows")
    return found


def load_r2_client(config):
    import boto3
    from botocore.config import Config

    try:
        return boto3.client(
            "s3",
            endpoint_url=f"https://{config['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id=config["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=config["R2_SECRET_ACCESS_KEY"],
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 5, "mode": "standard"},
            ),
        )
    except Exception as exc:
        raise ImportFailure(f"Could not initialize R2 client ({type(exc).__name__})") from None


def r2_object_exists(client, bucket, key):
    from botocore.exceptions import ClientError

    try:
        metadata = client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code in ("404", "NoSuchKey", "NotFound") or status == 404:
            return False
        raise ImportFailure(f"R2 HEAD failed for object ({code or status})") from None
    if metadata.get("ContentType") != "image/webp":
        raise ImportFailure(f"Existing R2 object has unexpected Content-Type: {key}")
    return True


def sync_categories(session, config, category_slugs):
    sys.path.insert(0, str(ROOT / "scraper"))
    from categories import CATEGORIES

    definitions = {slug: (name, parent) for slug, name, parent in CATEGORIES}
    unknown = category_slugs - definitions.keys()
    if unknown:
        raise ImportFailure(f"Unknown category slugs in export: {len(unknown)}")

    required_slugs = set(category_slugs)
    for slug in tuple(required_slugs):
        parent = definitions[slug][1]
        while parent is not None:
            required_slugs.add(parent)
            parent = definitions[parent][1]

    root_rows = [
        {"slug": slug, "name": definitions[slug][0], "parent_id": None}
        for slug in sorted(required_slugs)
        if definitions[slug][1] is None
    ]
    upsert_rows(session, config, "categories", root_rows, "slug")
    category_ids = fetch_by_slugs(
        session,
        config,
        "categories",
        {row["slug"] for row in root_rows},
    ) if root_rows else {}

    while set(category_ids) != required_slugs:
        child_rows = [
            {
                "slug": slug,
                "name": definitions[slug][0],
                "parent_id": category_ids[definitions[slug][1]],
            }
            for slug in sorted(required_slugs - set(category_ids))
            if definitions[slug][1] in category_ids
        ]
        if not child_rows:
            raise ImportFailure("Could not resolve category parent relationships")
        upsert_rows(session, config, "categories", child_rows, "slug")
        category_ids.update(
            fetch_by_slugs(
                session,
                config,
                "categories",
                {row["slug"] for row in child_rows},
            )
        )
    return {slug: category_ids[slug] for slug in category_slugs}


def public_image_url(base_url, key):
    return base_url.rstrip("/") + "/" + quote(key, safe="/")


def import_inventory(products, images, category_slugs, config, limit):
    r2_client = load_r2_client(config)
    supabase = build_supabase_session(config)
    category_ids = sync_categories(supabase, config, category_slugs)

    product_rows = []
    for product in products:
        row = {
            key: product[key]
            for key in (
                "sku",
                "slug",
                "name",
                "price_vnd",
                "price_text",
                "description",
                "source_url",
                "needs_photos",
            )
        }
        row["category_id"] = category_ids[product["category_slug"]]
        product_rows.append(row)
    upsert_rows(supabase, config, "products", product_rows, "slug")
    product_ids = fetch_by_slugs(
        supabase, config, "products", {product["slug"] for product in products}
    )

    uploaded = 0
    already_present = 0
    for image in images:
        key = image["file"]
        if r2_object_exists(r2_client, config["R2_BUCKET"], key):
            already_present += 1
            continue
        local_file = EXPORT_DIR.joinpath(*PurePosixPath(key).parts)
        try:
            r2_client.upload_file(
                str(local_file),
                config["R2_BUCKET"],
                key,
                ExtraArgs={
                    "ContentType": "image/webp",
                    "CacheControl": "public, max-age=31536000",
                },
            )
        except Exception as exc:
            raise ImportFailure(f"R2 upload failed for {key} ({type(exc).__name__})") from None
        uploaded += 1

    image_rows = [
        {
            "product_id": product_ids[image["slug"]],
            "position": image["position"],
            "object_key": image["file"],
            "source_url": image["source_url"],
        }
        for image in images
    ]
    upsert_rows(
        supabase,
        config,
        "product_images",
        image_rows,
        "product_id,position",
    )

    print(f"Products upserted: {len(product_rows)}")
    print(f"Categories upserted: {len(category_ids)}")
    print(f"Images uploaded to R2: {uploaded}")
    print(f"Images already present in R2 (not re-uploaded): {already_present}")
    if limit is not None:
        base_url = config["R2_PUBLIC_BASE_URL"]
        for image in images[:3]:
            print(f"Test image: {public_image_url(base_url, image['file'])}")
        return

    next_sku = supabase_request(
        supabase,
        config,
        "reset_products_sku_sequence",
        payload={},
        is_rpc=True,
    )
    if next_sku != "TG-00736":
        raise ImportFailure(
            f"SKU sequence verification expected TG-00736, received {next_sku!r}"
        )
    print(f"Next generated SKU verified by Supabase RPC: {next_sku}")
    verify_remote_counts(supabase, r2_client, config, products, images)


def verify_remote_counts(session, r2_client, config, products, images):
    slugs = {product["slug"] for product in products}
    observed_products = fetch_by_slugs(session, config, "products", slugs)
    ids = set(observed_products.values())
    observed_image_rows = 0
    for batch in chunks(sorted(ids), 100):
        encoded = ",".join(batch)
        rows = supabase_request(
            session,
            config,
            "product_images",
            params={"select": "id,product_id,position", "product_id": f"in.({encoded})"},
        )
        observed_image_rows += len(rows or [])

    object_count = 0
    for image in images:
        if r2_object_exists(r2_client, config["R2_BUCKET"], image["file"]):
            object_count += 1
    try:
        bucket_object_count = sum(
            page.get("KeyCount", 0)
            for page in r2_client.get_paginator("list_objects_v2").paginate(
                Bucket=config["R2_BUCKET"]
            )
        )
    except Exception as exc:
        raise ImportFailure(
            f"Could not count R2 bucket objects ({type(exc).__name__})"
        ) from None

    print(f"Supabase products matching CSV: {len(observed_products)}/{len(products)}")
    print(f"Supabase product_images rows matching CSV: {observed_image_rows}/{len(images)}")
    print(f"R2 objects matching product_images.csv: {object_count}/{len(images)}")
    print(f"Total objects in R2 bucket: {bucket_object_count}")
    if len(observed_products) != len(products) or observed_image_rows != len(images) or object_count != len(images):
        raise ImportFailure("Final remote counts do not match the CSV manifests")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Validate and count only; no network or writes")
    parser.add_argument("--limit", type=int, help="Import the first N products in products.csv")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")

    try:
        products, images, category_slugs = load_export(args.limit)
        if args.dry_run:
            print_dry_run(products, images, category_slugs)
            return 0
        config = load_config()
        import_inventory(products, images, category_slugs, config, args.limit)
        return 0
    except ImportFailure as exc:
        print(f"Import stopped: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
