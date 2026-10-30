#!/usr/bin/env python3
r"""Nhập dữ liệu từ SQLite (data/scrape.db) sang PostgreSQL. Chạy lại nhiều lần an toàn (upsert theo slug).

  .\.venv\Scripts\python -m pip install psycopg2-binary
  .\.venv\Scripts\python import_to_postgres.py --dry-run          # chỉ thống kê, không kết nối DB
  .\.venv\Scripts\python import_to_postgres.py --limit 3          # thử 3 sản phẩm
  .\.venv\Scripts\python import_to_postgres.py                    # nhập tất cả

Kết nối: biến môi trường DATABASE_URL, hoặc DATABASE_URL trong file .env ở thư mục dự án,
mặc định postgresql://tiengiay:change_me@localhost:5432/tiengiay
"""
import argparse
import json
import os
import sqlite3
from pathlib import Path

from categories import CATEGORIES

ROOT = Path(__file__).resolve().parent.parent
SQLITE = ROOT / "data" / "scrape.db"


def database_url():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return "postgresql://tiengiay:change_me@localhost:5432/tiengiay"


def load_rows(limit):
    con = sqlite3.connect(SQLITE)
    con.row_factory = sqlite3.Row
    sql = "SELECT * FROM products ORDER BY url"
    if limit:
        sql += f" LIMIT {int(limit)}"
    rows = []
    for r in con.execute(sql):
        d = dict(r)
        d["images"] = json.loads(d.get("images_json") or "[]")
        rows.append(d)
    return rows


def norm_image(i, im):
    """Chấp nhận cả dạng chưa tải (original/sized) và đã tải (local_path/source_url)."""
    return (
        im.get("position", i),
        im.get("local_path"),
        im.get("source_url") or im.get("original"),
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    rows = load_rows(args.limit)
    n_img = sum(len(r["images"]) for r in rows)
    no_cat = sum(1 for r in rows if not r["category_slug"])
    print(f"SQLite: {len(rows)} sản phẩm, {n_img} ảnh, {no_cat} chưa có danh mục")
    if args.dry_run:
        for r in rows[:3]:
            print("  mẫu:", r["slug"], "|", r["title"], "|", r["price_text"], "|", len(r["images"]), "ảnh")
        print("(dry-run: không ghi gì vào PostgreSQL)")
        return

    import psycopg2  # import muộn để --dry-run chạy được khi chưa cài

    conn = psycopg2.connect(database_url())
    try:
        with conn, conn.cursor() as cur:
            # 1) danh mục (cha trước, rồi con)
            ids = {}
            for slug, name, parent in CATEGORIES:
                if parent is None:
                    cur.execute(
                        """INSERT INTO categories(slug, name, parent_id) VALUES (%s,%s,NULL)
                           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id""", (slug, name))
                    ids[slug] = cur.fetchone()[0]
            for slug, name, parent in CATEGORIES:
                if parent is not None:
                    cur.execute(
                        """INSERT INTO categories(slug, name, parent_id) VALUES (%s,%s,%s)
                           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, parent_id=EXCLUDED.parent_id
                           RETURNING id""", (slug, name, ids[parent]))
                    ids[slug] = cur.fetchone()[0]
            print(f"Danh mục: {len(ids)}")

            # 2) sản phẩm + ảnh
            for r in rows:
                cur.execute(
                    """INSERT INTO products(slug, title, category_id, price_vnd, price_text, description, source_url, status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,'active')
                       ON CONFLICT (slug) DO UPDATE SET
                         title=EXCLUDED.title, category_id=EXCLUDED.category_id,
                         price_vnd=EXCLUDED.price_vnd, price_text=EXCLUDED.price_text,
                         description=EXCLUDED.description, source_url=EXCLUDED.source_url,
                         updated_at=now()
                       RETURNING id""",
                    (r["slug"], r["title"], ids.get(r["category_slug"]), r["price_vnd"],
                     r["price_text"], r["description"] or None, r["url"]))
                pid = cur.fetchone()[0]
                for i, im in enumerate(r["images"]):
                    pos, local, src = norm_image(i, im)
                    cur.execute(
                        """INSERT INTO product_images(product_id, position, local_path, source_url)
                           VALUES (%s,%s,%s,%s)
                           ON CONFLICT (product_id, position) DO UPDATE SET
                             local_path=COALESCE(EXCLUDED.local_path, product_images.local_path),
                             source_url=EXCLUDED.source_url""",
                        (pid, pos, local, src))
        with conn.cursor() as cur:
            for t in ("categories", "products", "product_images"):
                cur.execute(f"SELECT count(*) FROM {t}")
                print(f"PostgreSQL.{t}: {cur.fetchone()[0]}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
