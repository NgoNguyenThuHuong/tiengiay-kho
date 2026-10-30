#!/usr/bin/env python3
"""Chẩn đoán dữ liệu trong SQLite (chỉ đọc, không sửa gì).
Chạy:  .\.venv\Scripts\python diagnose.py
Gửi toàn bộ kết quả in ra cho Claude.
"""
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "scrape.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
q = lambda s, *a: con.execute(s, a).fetchall()
one = lambda s, *a: con.execute(s, a).fetchone()[0]

print("=== 1. Tổng quan ===")
for st, n in [(r[0], r[1]) for r in q("SELECT status, COUNT(*) FROM product_urls GROUP BY status")]:
    print(f"  product_urls.{st}: {n}")
print("  list_pages đã quét:", one("SELECT COUNT(*) FROM list_pages"))
print("  products:", one("SELECT COUNT(*) FROM products"))

print("\n=== 2. URL theo danh mục (số URL tìm được ở mỗi danh mục) ===")
for r in q("SELECT COALESCE(category_slug,'(không có)') c, COUNT(*) n FROM product_urls GROUP BY c ORDER BY n DESC"):
    print(f"  {r['n']:5}  {r['c']}")

print("\n=== 3. 25 URL bị 'skipped' (xem có phải sản phẩm thật không) ===")
for r in q("SELECT url FROM product_urls WHERE status='skipped' LIMIT 25"):
    print("  ", r["url"])

print("\n=== 4. Chất lượng 'products' ===")
total = one("SELECT COUNT(*) FROM products") or 1
no_price = one("SELECT COUNT(*) FROM products WHERE price_text IS NULL")
negot = one("SELECT COUNT(*) FROM products WHERE price_text LIKE 'Th%thuận%'")
with_price = one("SELECT COUNT(*) FROM products WHERE price_vnd IS NOT NULL")
no_img = one("SELECT COUNT(*) FROM products WHERE images_json IS NULL OR images_json='[]'")
no_desc = one("SELECT COUNT(*) FROM products WHERE description IS NULL OR description=''")
no_cat = one("SELECT COUNT(*) FROM products WHERE category_slug IS NULL")
print(f"  Có giá số         : {with_price}/{total}")
print(f"  'Thỏa thuận'      : {negot}/{total}")
print(f"  KHÔNG nhận ra giá : {no_price}/{total}   <-- nếu cao: parser giá cần sửa")
print(f"  Không có ảnh      : {no_img}/{total}")
print(f"  Không có mô tả    : {no_desc}/{total}")
print(f"  Không có danh mục : {no_cat}/{total}")

print("\n=== 5. 8 sản phẩm không nhận ra giá (mở thử trên web để xem giá nằm ở đâu) ===")
for r in q("SELECT url, title FROM products WHERE price_text IS NULL LIMIT 8"):
    print("  ", r["url"], "|", r["title"][:60])

print("\n=== 6. 5 sản phẩm mẫu ===")
for r in q("SELECT url, title, price_vnd, price_text, category_slug, substr(description,1,80) d FROM products LIMIT 5"):
    print(" ", dict(r))
