#!/usr/bin/env python3
"""Prepare a deterministic, offline Supabase inventory export from data/scrape.db."""

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "scrape.db"
EXPORT_DIR = DATA_DIR / "export"
MAX_EDGE = 1600
WEBP_QUALITY = 82
MIN_SOURCE_EDGE = 400
PRODUCT_FIELDS = (
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
IMAGE_FIELDS = ("slug", "position", "file", "source_url", "width", "height")


def load_products():
    import sqlite3

    connection = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """SELECT url, slug, title, category_slug, price_vnd, price_text,
                      description, images_json
               FROM products
               ORDER BY slug"""
        ).fetchall()
    finally:
        connection.close()

    seen_slugs = set()
    for row in rows:
        slug = row["slug"]
        if not slug or not re.fullmatch(r"[A-Za-z0-9_-]+", slug):
            raise ValueError(f"Product has an invalid slug: {slug!r}")
        if slug in seen_slugs:
            raise ValueError(f"Duplicate product slug: {slug}")
        seen_slugs.add(slug)
    return rows


def checked_source_images(product):
    images = json.loads(product["images_json"] or "[]")
    eligible = []
    counts = {"valid": 0, "too_small": 0, "broken": 0}
    for image in images:
        local_path = image.get("local_path")
        if not local_path:
            counts["broken"] += 1
            continue

        source_path = DATA_DIR / Path(local_path.replace("\\", "/"))
        try:
            with Image.open(source_path) as source:
                source.verify()
            with Image.open(source_path) as source:
                width, height = source.size
                source.load()
        except (FileNotFoundError, UnidentifiedImageError, OSError, ValueError, SyntaxError):
            counts["broken"] += 1
            continue

        if max(width, height) < MIN_SOURCE_EDGE:
            counts["too_small"] += 1
            continue

        counts["valid"] += 1
        eligible.append((image, source_path))
    return eligible, counts


def write_csv(path, fieldnames, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def image_directory_name(slug):
    if len(slug) <= 100:
        return slug
    suffix = hashlib.sha256(slug.encode("utf-8")).hexdigest()[:16]
    return f"{slug[:80]}--{suffix}"


def convert_to_webp(source_path, destination):
    with Image.open(source_path) as source:
        source = ImageOps.exif_transpose(source)
        source.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        if source.mode not in ("RGB", "RGBA"):
            source = source.convert("RGBA" if "A" in source.getbands() else "RGB")
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.save(destination, "WEBP", quality=WEBP_QUALITY, method=6)
        return source.size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="Export the first N products in stable slug order")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")

    products = load_products()
    export_products = products[: args.limit] if args.limit is not None else products
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    product_rows = []
    image_rows = []
    totals = {"valid": 0, "too_small": 0, "broken": 0}
    photo_needed = 0

    for sku_number, product in enumerate(export_products, start=1):
        slug = product["slug"]
        source_images, counts = checked_source_images(product)
        for kind, count in counts.items():
            totals[kind] += count

        needs_photos = len(source_images) < 2
        photo_needed += int(needs_photos)
        product_rows.append(
            {
                "sku": f"TG-{sku_number:05d}",
                "slug": slug,
                "name": product["title"],
                "price_vnd": product["price_vnd"],
                "price_text": product["price_text"],
                "description": product["description"] or "",
                "source_url": product["url"],
                "category_slug": product["category_slug"] or "",
                "needs_photos": str(needs_photos).lower(),
            }
        )

        for position, (image, source_path) in enumerate(source_images):
            relative_file = Path("images") / image_directory_name(slug) / f"{position}.webp"
            destination = EXPORT_DIR / relative_file
            width, height = convert_to_webp(source_path, destination)
            image_rows.append(
                {
                    "slug": slug,
                    "position": position,
                    "file": relative_file.as_posix(),
                    "source_url": image.get("source_url") or image.get("original") or "",
                    "width": width,
                    "height": height,
                }
            )

    write_csv(EXPORT_DIR / "products.csv", PRODUCT_FIELDS, product_rows)
    write_csv(EXPORT_DIR / "product_images.csv", IMAGE_FIELDS, image_rows)

    webp_files = [EXPORT_DIR / image["file"] for image in image_rows]
    total_bytes = sum(path.stat().st_size for path in webp_files)
    print(f"Products exported: {len(product_rows)}")
    print(f"Image references checked: {sum(totals.values())}")
    print(f"Valid source images (long edge >= {MIN_SOURCE_EDGE}px): {totals['valid']}")
    print(f"Filtered too-small images: {totals['too_small']}")
    print(f"Filtered broken or missing images: {totals['broken']}")
    print(f"WebP files: {len(webp_files)}")
    print(f"Total WebP size: {total_bytes} bytes ({total_bytes / 1_000_000:.3f} MB)")
    print(f"Products needing photos (<2 eligible images): {photo_needed}")


if __name__ == "__main__":
    main()
