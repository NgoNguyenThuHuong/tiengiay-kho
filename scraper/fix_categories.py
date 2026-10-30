#!/usr/bin/env python3
r"""Sửa danh mục sản phẩm theo breadcrumb (div.link_seo) của từng trang sản phẩm.
Chỉ cập nhật cột category_slug trong SQLite; không đụng PostgreSQL (nhập lại bằng import_to_postgres.py).
Có thể dừng/chạy tiếp: kết quả đã lấy được lưu trong bảng category_fix.

  .\.venv\Scripts\python fix_categories.py --limit 10 --dry-run   # thử 10 trang, chỉ in kết quả
  .\.venv\Scripts\python fix_categories.py                        # chạy toàn bộ (~10 phút)
  .\.venv\Scripts\python import_to_postgres.py                    # nhập lại sau khi xong
"""
import argparse
import sqlite3
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin

import requests

from categories import CATEGORIES, CATEGORY_SLUGS
from parser import slug_of, soup_of

DB = Path(__file__).resolve().parent.parent / "data" / "scrape.db"
DELAY = 0.8
PARENT = {slug: parent for slug, _name, parent in CATEGORIES}
DEPTH = {slug: (0 if parent is None else 1) for slug, _n, parent in CATEGORIES}


def breadcrumb_category(html, url):
    """Danh mục sâu nhất trong breadcrumb; None nếu không thấy."""
    soup = soup_of(html)
    found = []
    for a in soup.select("div.link_seo a"):
        s = slug_of(urljoin(url, a.get("href", "")))
        if s in CATEGORY_SLUGS:
            found.append(s)
    if not found:
        return None
    return max(found, key=lambda s: (DEPTH[s], found.index(s)))  # sâu nhất; hòa thì lấy cái sau


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE IF NOT EXISTS category_fix(url TEXT PRIMARY KEY, category_slug TEXT)")
    done = {r[0] for r in con.execute("SELECT url FROM category_fix")} if not args.dry_run else set()
    rows = [r for r in con.execute("SELECT url, category_slug FROM products ORDER BY url") if r["url"] not in done]
    if args.limit:
        rows = rows[: args.limit]
    print(f"Cần xử lý {len(rows)} trang")

    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0 (compatible; tiengiay-migration/1.0)"})
    stats = Counter()
    nones = []
    for i, row in enumerate(rows, 1):
        html = None
        for attempt in range(1, 4):
            time.sleep(DELAY)
            try:
                r = sess.get(row["url"], timeout=25)
                if r.status_code == 200:
                    html = r.text
                    break
            except requests.RequestException as e:
                print(f"  ! {row['url']}: {e} (lần {attempt})")
            time.sleep(2 * attempt)
        if html is None:
            stats["lỗi tải"] += 1
            continue
        new = breadcrumb_category(html, row["url"])
        if new is None:
            stats["không thấy breadcrumb"] += 1
            nones.append(row["url"])
            continue
        stats["giữ nguyên" if new == row["category_slug"] else "đổi danh mục"] += 1
        if args.dry_run:
            print(f"  {row['category_slug']} -> {new} | {row['url']}")
        else:
            con.execute("UPDATE products SET category_slug=? WHERE url=?", (new, row["url"]))
            con.execute("INSERT OR REPLACE INTO category_fix(url, category_slug) VALUES (?,?)", (row["url"], new))
            if i % 25 == 0:
                con.commit()
        if i % 50 == 0:
            print(f"  {i}/{len(rows)}")
    con.commit()

    print("\n---- kết quả ----")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    if nones:
        print("Ví dụ trang không thấy breadcrumb (gửi cho Claude nếu nhiều):")
        for u in nones[:5]:
            print("  ", u)
    if not args.dry_run:
        print("\nPhân bố danh mục hiện tại:")
        for r in con.execute("SELECT category_slug, COUNT(*) n FROM products GROUP BY 1 ORDER BY 2 DESC"):
            print(f"  {r['n']:4}  {r['category_slug']}")


if __name__ == "__main__":
    main()
