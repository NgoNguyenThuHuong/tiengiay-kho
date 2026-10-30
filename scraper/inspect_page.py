#!/usr/bin/env python3
"""In cấu trúc quanh tiêu đề, giá và ảnh của 1 trang sản phẩm để chỉnh parser.
  .\.venv\Scripts\python inspect_page.py https://tiengiay.vn/5-cent-1946--coins-of-french-indochina
Chỉ in ra màn hình, không ghi gì. Gửi toàn bộ kết quả cho Claude.
"""
import re, sys
import requests
from bs4 import BeautifulSoup

url = sys.argv[1]
html = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=25).text
soup = BeautifulSoup(html, "lxml")

def path(el, depth=7):
    out = []
    while el is not None and el.name not in (None, "[document]") and depth:
        out.append(el.name + ("#" + el["id"] if el.get("id") else "") + ("." + ".".join(el.get("class", [])) if el.get("class") else ""))
        el, depth = el.parent, depth - 1
    return " < ".join(out)

h1 = soup.find("h1")
print("H1:", h1.get_text(strip=True) if h1 else None, "\n  ", path(h1) if h1 else "")
print("\n--- Dòng có 'Giá' / 'đ' / 'Thỏa thuận' / 'Liên hệ' (thứ tự trong trang) ---")
for s in soup.find_all(string=True):
    t = " ".join(str(s).split())
    if t and s.parent.name not in ("script", "style") and re.search(r"giá|\d\s*(đ|₫)|thỏa thuận|liên hệ|liên quan|cùng loại", t, re.I):
        print(f"  [{path(s.parent, 4)}] {t[:90]}")
print("\n--- Ảnh /upload/ (thứ tự trong trang) ---")
for img in soup.find_all("img"):
    for a in ("src", "data-src", "data-original", "data-lazy"):
        v = img.get(a)
        if v and "/upload/" in v:
            print(f"  {a}={v}\n      [{path(img.parent, 5)}]")
for a in soup.find_all("a", href=True):
    if re.search(r"/upload/.*\.(jpe?g|png|webp)", a["href"], re.I):
        print(f"  a href={a['href']}\n      [{path(a.parent, 5)}]")
