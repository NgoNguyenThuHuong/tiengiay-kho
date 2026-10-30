#!/usr/bin/env python3
"""Lấy dữ liệu công khai từ web cũ vào SQLite (có thể dừng/chạy tiếp bất kỳ lúc nào).

Thứ tự chạy:
  python scrape.py inspect https://tiengiay.vn/xu-viet-nam   # xem HTML thật, kiểm tra parser
  python scrape.py lists       # 1) quét danh mục -> danh sách URL sản phẩm
  python scrape.py products    # 2) vào từng sản phẩm lấy chi tiết
  python scrape.py images      # 3) tải ảnh về data/images/
  python scrape.py stats       # xem tiến độ
"""
import argparse
import io
import json
import os
import sqlite3
import sys
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

import tempfile
import time
from pathlib import Path

import requests
from PIL import Image, UnidentifiedImageError

from categories import crawl_order
from parser import BASE, original_image_url, parse_list_page, parse_product

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DB_PATH = DATA / "scrape.db"
IMG_DIR = DATA / "images"
DEBUG_DIR = DATA / "debug"

DELAY = 1.0          # tối đa khoảng 1 yêu cầu/giây
TIMEOUT = 25
MAX_TRIES = 4
MAX_LIST_PAGES = 400  # chặn vòng lặp vô hạn khi quét phân trang
UA = "Mozilla/5.0 (compatible; tiengiay-migration/1.0)"

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "vi,en;q=0.8"})
_last = 0.0


def get(url, binary=False):
    """GET có giãn cách + thử lại. Trả về response hoặc None."""
    global _last
    for attempt in range(1, MAX_TRIES + 1):
        wait = DELAY - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.time()
        try:
            r = session.get(url, timeout=TIMEOUT)
            if r.status_code == 200:
                return r
            if r.status_code == 404:
                return None
            print(f"  ! {r.status_code} {url} (lần {attempt})")
        except requests.RequestException as e:
            print(f"  ! lỗi mạng {url}: {e} (lần {attempt})")
        time.sleep(2 * attempt)
    return None


def image_validation_error(content, content_type):
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if not media_type.startswith("image/"):
        return f"Content-Type không phải ảnh: {media_type or '(trống)'}"
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            image.load()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        return f"Dữ liệu ảnh không hợp lệ: {exc}"
    return None


def image_file_is_valid(path):
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            image.load()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        return False
    return True


def save_valid_image(content, content_type, dest):
    error = image_validation_error(content, content_type)
    if error:
        print(f"  ! Bỏ qua ảnh không hợp lệ {dest}: {error}")
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and image_file_is_valid(dest):
        return True

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=dest.parent, suffix=dest.suffix, delete=False) as temp:
            temp_path = Path(temp.name)
            temp.write(content)
        if not image_file_is_valid(temp_path):
            raise OSError(f"Không xác thực được tệp ảnh tạm: {temp_path}")
        os.replace(temp_path, dest)
        return True
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def local_image_path(local_path):
    relative = Path(str(local_path).replace("\\", "/"))
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Đường dẫn ảnh không hợp lệ: {local_path}")
    return DATA.joinpath(*relative.parts)


def image_candidates(image, position, refreshed_images):
    candidates = [image.get("original"), image.get("source_url"), image.get("sized")]
    if position < len(refreshed_images):
        refreshed = refreshed_images[position]
        candidates.extend((refreshed.get("original"), refreshed.get("sized")))
    return list(dict.fromkeys(url for url in candidates if url))


def db():
    DATA.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript("""
    CREATE TABLE IF NOT EXISTS product_urls (
        url TEXT PRIMARY KEY,
        category_slug TEXT,
        status TEXT NOT NULL DEFAULT 'pending',   -- pending | done | skipped | error
        error TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
        url TEXT PRIMARY KEY,
        slug TEXT, title TEXT, category_slug TEXT,
        price_vnd INTEGER, price_text TEXT, description TEXT,
        images_json TEXT,
        images_done INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS list_pages (
        url TEXT PRIMARY KEY,
        done INTEGER NOT NULL DEFAULT 0
    );
    """)
    return con


# ---------------------------------------------------------------- 1) lists
def crawl_listing(con, start_url, category_slug):
    queue, seen, found = [start_url], set(), 0
    while queue and len(seen) < MAX_LIST_PAGES:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        if con.execute("SELECT done FROM list_pages WHERE url=?", (url,)).fetchone():
            row = con.execute("SELECT done FROM list_pages WHERE url=?", (url,)).fetchone()
            if row["done"]:
                continue
        r = get(url)
        if r is None:
            continue
        prods, pages = parse_list_page(r.text, url)
        new = 0
        for p in prods:
            cur = con.execute(
                "INSERT OR IGNORE INTO product_urls(url, category_slug) VALUES (?,?)",
                (p, category_slug),
            )
            new += cur.rowcount
        con.execute("INSERT OR REPLACE INTO list_pages(url, done) VALUES (?,1)", (url,))
        con.commit()
        found += new
        for pg in pages:
            if pg not in seen:
                queue.append(pg)
        print(f"  {url} -> {len(prods)} sp ({new} mới), {len(pages)} link phân trang")

        # Dự phòng: nếu web phân trang kiểu ?page=N mà không có link trong HTML
        if len(seen) == 1 and not pages and prods:
            n = 2
            while n <= MAX_LIST_PAGES:
                nxt = f"{start_url}{'&' if '?' in start_url else '?'}page={n}"
                r2 = get(nxt)
                if r2 is None:
                    break
                p2, _ = parse_list_page(r2.text, nxt)
                new2 = 0
                for p in p2:
                    cur = con.execute(
                        "INSERT OR IGNORE INTO product_urls(url, category_slug) VALUES (?,?)",
                        (p, category_slug),
                    )
                    new2 += cur.rowcount
                con.commit()
                print(f"  {nxt} -> {len(p2)} sp ({new2} mới)")
                if new2 == 0:
                    break
                found += new2
                n += 1
    return found


def cmd_lists(args):
    con = db()
    for slug in crawl_order():
        print(f"[danh mục] {slug}")
        crawl_listing(con, f"{BASE}/{slug}", slug)
    print("[tất cả sản phẩm] /san-pham")
    crawl_listing(con, f"{BASE}/san-pham", None)
    cmd_stats(args)


# ------------------------------------------------------------ 2) products
def cmd_products(args):
    con = db()
    rows = con.execute(
        "SELECT url, category_slug FROM product_urls WHERE status IN ('pending','error')"
    ).fetchall()
    
    total_urls = con.execute("SELECT count(*) FROM product_urls").fetchone()[0]
    if total_urls == 0:
        print("LỖI: Chưa có danh sách URL sản phẩm nào trong database (Cần xử lý 0 sản phẩm).")
        print("Gợi ý: Vui lòng chạy lệnh quét danh mục trước để lấy URL:")
        print("       python scrape.py lists")
        return
        
    if not rows:
        print("Không có sản phẩm nào đang ở trạng thái 'pending' hoặc 'error' để xử lý.")
        return

    if args.limit:
        rows = rows[: args.limit]
    total = len(rows)
    print(f"Cần xử lý {total} sản phẩm")
    for i, row in enumerate(rows, 1):
        is_dry = getattr(args, "dry_run", False)
        
        r = get(row["url"])
        if r is None:
            if not is_dry:
                con.execute("UPDATE product_urls SET status='error', error='fetch failed' WHERE url=?", (row["url"],))
                con.commit()
            else:
                print(f"[DRY RUN] Fetch failed: {row['url']}")
            continue
            
        data = parse_product(r.text, row["url"])
        if data is None:
            if not is_dry:
                con.execute("UPDATE product_urls SET status='skipped' WHERE url=?", (row["url"],))
                con.commit()
            else:
                print(f"[DRY RUN] Skipped (not a product page): {row['url']}")
            continue
            
        cat = row["category_slug"] or data["category_slug"]
        if is_dry:
            print(f"[DRY RUN] Lấy thành công: {data['title']} | Giá: {data['price_text']} | Số ảnh: {len(data['images'])}")
            continue

        con.execute(
            """INSERT OR REPLACE INTO products
               (url, slug, title, category_slug, price_vnd, price_text, description, images_json)
               VALUES (?,?,?,?,?,?,?,?)""",
            (data["url"], data["slug"], data["title"], cat, data["price_vnd"],
             data["price_text"], data["description"], json.dumps(data["images"], ensure_ascii=False)),
        )
        con.execute("UPDATE product_urls SET status='done' WHERE url=?", (row["url"],))
        con.commit()
        if i % 25 == 0 or i == total:
            print(f"  {i}/{total}")


# --------------------------------------------------------------- 3) images
def cmd_images(args):
    con = db()
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    query = "SELECT url, slug, images_json FROM products"
    if not args.repair:
        query += " WHERE images_done=0"
    rows = con.execute(query).fetchall()
    if args.limit:
        rows = rows[: args.limit]
    print(f"Cần kiểm tra ảnh cho {len(rows)} sản phẩm")
    for i, row in enumerate(rows, 1):
        imgs = json.loads(row["images_json"] or "[]")
        folder = IMG_DIR / row["slug"][:150]
        if not args.dry_run:
            folder.mkdir(parents=True, exist_ok=True)
        updated = []
        all_valid = True
        refreshed_images = None
        for pos, im in enumerate(imgs):
            position = im.get("position", pos)
            source_url = im.get("original") or im.get("source_url")
            ext = Path((source_url or "").split("?")[0]).suffix or ".jpg"
            dest = local_image_path(im["local_path"]) if im.get("local_path") else folder / f"{position}{ext}"

            if dest.is_file() and image_file_is_valid(dest):
                updated.append({
                    "position": position,
                    "local_path": str(dest.relative_to(DATA)),
                    "source_url": im.get("source_url") or source_url,
                })
                continue

            if args.dry_run:
                print(f"  [DRY RUN] Cần tải/xác thực: {dest}")
                all_valid = False
                updated.append(im)
                continue

            candidates = image_candidates(im, position, [])
            downloaded = False
            for url in candidates:
                response = get(url)
                if response is None:
                    continue
                error = image_validation_error(response.content, response.headers.get("Content-Type"))
                if error:
                    print(f"  ! Bỏ qua {url}: {error}")
                    continue
                if save_valid_image(response.content, response.headers.get("Content-Type"), dest):
                    source_url = url
                    downloaded = True
                    break

            if not downloaded and refreshed_images is None:
                page = get(row["url"])
                parsed = parse_product(page.text, row["url"]) if page is not None else None
                refreshed_images = parsed["images"] if parsed else []
                for url in image_candidates(im, position, refreshed_images):
                    if url in candidates:
                        continue
                    response = get(url)
                    if response is None:
                        continue
                    error = image_validation_error(response.content, response.headers.get("Content-Type"))
                    if error:
                        print(f"  ! Bỏ qua {url}: {error}")
                        continue
                    if save_valid_image(response.content, response.headers.get("Content-Type"), dest):
                        source_url = url
                        downloaded = True
                        break

            if downloaded:
                updated.append({
                    "position": position,
                    "local_path": str(dest.relative_to(DATA)),
                    "source_url": source_url,
                })
            else:
                print(f"  ! Chưa sửa được ảnh vị trí {position} của {row['slug']}")
                all_valid = False
                updated.append(im)

        if not args.dry_run:
            con.execute(
                "UPDATE products SET images_json=?, images_done=? WHERE url=?",
                (json.dumps(updated, ensure_ascii=False), int(all_valid), row["url"]),
            )
            con.commit()
        if i % 25 == 0 or i == len(rows):
            print(f"  {i}/{len(rows)}")


# ------------------------------------------------------------------ extras
def cmd_stats(_args):
    con = db()
    q = lambda s: con.execute(s).fetchone()[0]
    print("---- tiến độ ----")
    print("URL sản phẩm tìm thấy :", q("SELECT COUNT(*) FROM product_urls"))
    for st in ("pending", "done", "skipped", "error"):
        print(f"  {st:8}:", q(f"SELECT COUNT(*) FROM product_urls WHERE status='{st}'"))
    print("Sản phẩm đã lấy       :", q("SELECT COUNT(*) FROM products"))
    print("Đã tải ảnh            :", q("SELECT COUNT(*) FROM products WHERE images_done=1"))
    print("Chưa có danh mục      :", q("SELECT COUNT(*) FROM products WHERE category_slug IS NULL"))


def cmd_inspect(args):
    """Lưu HTML thật + in kết quả parse để kiểm tra/chỉnh parser."""
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    r = get(args.url)
    if r is None:
        sys.exit("Không tải được URL")
    name = (args.url.rstrip("/").split("/")[-1] or "home") + ".html"
    (DEBUG_DIR / name).write_text(r.text, encoding="utf-8")
    print(f"Đã lưu HTML: {DEBUG_DIR / name}")
    prods, pages = parse_list_page(r.text, args.url)
    print(f"Như trang danh mục: {len(prods)} link sản phẩm, {len(pages)} link phân trang")
    for p in prods[:5]:
        print("   sp:", p)
    for p in pages[:5]:
        print("   trang:", p)
    data = parse_product(r.text, args.url)
    print("Như trang sản phẩm:")
    print(json.dumps(data, ensure_ascii=False, indent=2) if data else "   (không nhận ra là trang sản phẩm)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("lists").set_defaults(fn=cmd_lists)
    p = sub.add_parser("products"); p.add_argument("--limit", type=int); p.add_argument("--dry-run", action="store_true"); p.set_defaults(fn=cmd_products)
    p = sub.add_parser("images")
    p.add_argument("--limit", type=int)
    p.add_argument("--repair", action="store_true", help="kiểm tra cả ảnh của sản phẩm đã đánh dấu hoàn tất")
    p.add_argument("--dry-run", action="store_true", help="chỉ rà soát tệp local, không gửi yêu cầu mạng")
    p.set_defaults(fn=cmd_images)
    sub.add_parser("stats").set_defaults(fn=cmd_stats)
    p = sub.add_parser("inspect"); p.add_argument("url"); p.set_defaults(fn=cmd_inspect)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
