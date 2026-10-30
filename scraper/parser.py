"""Phân tích HTML (bản 2). Giữ nguyên tên hàm: parse_list_page, parse_product, ...
Thay đổi so với bản 1:
  - Giá: chọn giá GẦN tiêu đề nhất (trước hoặc sau), nhận cả '₫', 'Liên hệ'.
  - Ảnh: đọc cả src/data-src/data-original/srcset và link <a href>; chỉ lấy /upload/sanpham/ và /upload/hinhthem/.
  - Không còn bỏ qua (skip) trang chỉ vì thiếu giá/ảnh: có tiêu đề là lưu, đánh dấu needs_review.
"""
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from categories import CATEGORY_SLUGS, RESERVED_SLUGS

BASE = "https://tiengiay.vn"

PAGE_LINK_RE = re.compile(r"([?&](page|p|trang)=\d+)|(/trang-\d+)|(/page/\d+)", re.I)
PRICE_RE = re.compile(r"(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:đ|₫|vnđ|vnd)(?![A-Za-z0-9])", re.I)
THUMB_SUFFIX_RE = re.compile(r"_\d+x\d+(?=\.\w+$)")
THUMB_PATH_RE = re.compile(r"/thumb/\d+x\d+/\d+(?=/upload/)")
NEGOTIABLE_RE = re.compile(r"th[ỏo]a\s*thu[ậa]n", re.I)
CONTACT_PRICE_RE = re.compile(r"li[êe]n\s*h[ệe]", re.I)
IMG_PATH_RE = re.compile(r"/upload/(sanpham|hinhthem)/", re.I)
IMG_ATTRS = ("src", "data-src", "data-original", "data-lazy", "data-lazy-src", "data-echo")
CUT_MARKERS = ("Sản phẩm liên quan", "Sản phẩm cùng loại", "Sản phẩm khác", "Bình luận", "Tin liên quan")


def soup_of(html):
    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        return BeautifulSoup(html, "html.parser")


def slug_of(url):
    p = urlparse(url)
    if p.netloc and p.netloc.replace("www.", "") != "tiengiay.vn":
        return None
    parts = [x for x in p.path.split("/") if x]
    return parts[0] if len(parts) == 1 else None


def is_product_slug(slug):
    return bool(slug) and slug not in RESERVED_SLUGS and not slug.startswith("shop-")


def parse_list_page(html, page_url):
    soup = soup_of(html)
    products, pages = [], []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        url = urljoin(page_url, href).split("#")[0]
        if PAGE_LINK_RE.search(url):
            if url not in pages:
                pages.append(url)
            continue
        slug = slug_of(url)
        if is_product_slug(slug):
            clean = f"{BASE}/{slug}"
            if clean not in products:
                products.append(clean)
    return products, pages


def parse_price(text):
    if not text:
        return None, None
    if NEGOTIABLE_RE.search(text):
        return None, "Thỏa thuận"
    m = PRICE_RE.search(text)
    if m:
        digits = re.sub(r"[^\d]", "", m.group(1))
        return (int(digits) if digits else None), m.group(0).strip()
    if CONTACT_PRICE_RE.search(text):   # chỉ dùng cho ô giá li.gia: "Giá: Liên hệ"
        return None, "Liên hệ"
    return None, None


def original_image_url(url):
    url = THUMB_PATH_RE.sub("", url)
    return THUMB_SUFFIX_RE.sub("", url)


def _clean_text(s):
    return re.sub(r"\s+", " ", s or "").strip()


def _cut_related(node):
    """Bản sao của node, đã bỏ mọi thứ từ mục 'Sản phẩm liên quan...' trở xuống."""
    clone = BeautifulSoup(str(node), "html.parser")
    for st in clone.find_all(string=True):
        if any(m.lower() in str(st).lower() for m in CUT_MARKERS):
            el = st.parent
            while el is not None and el.name not in (None, "[document]"):
                for sib in list(el.next_siblings):
                    sib.extract()
                el = el.parent
            st.parent.extract()
            break
    return clone


def _img_candidates(node, page_url):
    """Mọi URL ảnh trong node: <img> (nhiều thuộc tính), srcset, <a href> trỏ tới ảnh."""
    node = _cut_related(node)
    urls = []
    for img in node.find_all("img"):
        for attr in IMG_ATTRS:
            if img.get(attr):
                urls.append(img[attr])
        for ss in (img.get("srcset"), img.get("data-srcset")):
            if ss:
                urls += [part.strip().split(" ")[0] for part in ss.split(",") if part.strip()]
    for a in node.find_all("a", href=True):
        if re.search(r"\.(jpe?g|png|webp|gif)(\?|$)", a["href"], re.I):
            urls.append(a["href"])
    out = []
    for u in urls:
        u = urljoin(page_url, u.strip())
        if IMG_PATH_RE.search(u):
            out.append(u)
    return out


def _find_price(soup, h1):
    """Giá đầu tiên sau tiêu đề; nếu không có thì giá gần nhất trước tiêu đề."""
    nodes = [s for s in soup.find_all(string=True)
             if s.parent and s.parent.name not in ("script", "style", "noscript")]
    h_idx = None
    if h1 is not None:
        first = h1.find(string=True)
        for i, s in enumerate(nodes):
            if s is first:
                h_idx = i
                break
    after, before = None, None
    for i, s in enumerate(nodes):
        t = str(s)
        if not (NEGOTIABLE_RE.search(t) or PRICE_RE.search(t)):
            continue
        vnd, txt = parse_price(t)
        if not txt:
            continue
        if h_idx is None:
            return vnd, txt
        if i >= h_idx:
            if after is None:        # giá đầu tiên SAU tiêu đề = giá sản phẩm chính
                after = (vnd, txt)
        else:
            before = (vnd, txt)      # giá gần nhất TRƯỚC tiêu đề (dự phòng)
    return after or before or (None, None)


def _find_images(soup, h1, url):
    imgs, seen = [], set()

    def add(urls):
        for u in urls:
            key = original_image_url(u)
            if key not in seen:
                seen.add(key)
                imgs.append({"original": key, "sized": u})

    if h1 is not None:
        node = h1
        for _ in range(8):  # container nhỏ nhất quanh tiêu đề có chứa ảnh sản phẩm
            node = node.parent
            if node is None:
                break
            found = _img_candidates(node, url)
            if found:
                add(found)
                break
    if not imgs:  # dự phòng: og:image nếu là ảnh sản phẩm
        og = soup.find("meta", property="og:image")
        if og and og.get("content") and IMG_PATH_RE.search(og["content"]):
            add([urljoin(url, og["content"])])
    return imgs[:12]


def _find_description(soup, h1, title, price_text):
    node = h1
    text = ""
    for _ in range(6):
        node = node.parent if node is not None else None
        if node is None:
            break
        clone = BeautifulSoup(str(node), "html.parser")
        for t in clone(["script", "style", "noscript", "form", "select", "button"]):
            t.decompose()
        txt = _clean_text(clone.get_text(" "))
        for m in CUT_MARKERS:
            i = txt.find(m)
            if i > 0:
                txt = txt[:i]
        if len(txt) > len(title) + 40:
            text = txt
            break
    text = text.replace(title, "", 1)
    return _clean_text(text)[:3000]



UPLOAD_URL_RE = re.compile(r"""[^"'\s()=,]*upload/(?:sanpham|hinhthem)/[^"'\s()<>]+""", re.I)
JUNK_LINE_RE = re.compile(r"số lượng|đặt mua|thêm vào giỏ|mua ngay|chia sẻ", re.I)
CONTACT_LABEL_RE = re.compile(r"liên hệ|điện thoại|dt\b|email|e-mail|địa chỉ|zalo|facebook|người đăng|ngày đăng|lượt xem|mã sp", re.I)


def _parse_structured(soup, url, title_hint=""):
    """Cấu trúc thật: div.wap_pro > ul.product_info > li.gia ; ảnh trong div.zoom_slick."""
    pro = soup.select_one("div.wap_pro")
    if pro is None:
        return None
    # --- giá
    price_vnd, price_text = None, None
    li = pro.select_one("li.gia")
    if li is not None:
        price_vnd, price_text = parse_price(_clean_text(li.get_text(" ")))
    # --- ảnh: quét mọi thuộc tính trong khối sản phẩm (không đụng 'Sản phẩm cùng loại')
    images, seen = [], set()
    for m in UPLOAD_URL_RE.findall(str(pro)):
        u = urljoin(url, m)
        key = original_image_url(u)
        if key not in seen:
            seen.add(key)
            images.append({"original": key, "sized": u})
    # --- mô tả: các dòng thông tin còn lại (bỏ giá và thông tin liên hệ người bán)
    lines = []
    for item in pro.select("ul.product_info li"):
        if "gia" in (item.get("class") or []):
            continue
        t = _clean_text(item.get_text(" "))
        if (t and not CONTACT_LABEL_RE.search(t) and not JUNK_LINE_RE.search(t)
                and t.lower() != title_hint.lower()):
            lines.append(t)
    return {"price_vnd": price_vnd, "price_text": price_text,
            "images": images[:12], "description": " | ".join(lines)[:3000]}


def parse_product(html, url):
    """Trả về dict; None chỉ khi KHÔNG có tiêu đề nào. Có cờ needs_review khi thiếu giá/ảnh."""
    soup = soup_of(html)
    h1 = soup.find("h1")
    og_title = soup.find("meta", property="og:title")
    title = _clean_text(h1.get_text()) if h1 else ""
    if not title:
        li_ten = soup.select_one("div.wap_pro li.ten")
        if li_ten is not None:
            title = _clean_text(li_ten.get_text(" "))
    if not title and soup.title:
        title = _clean_text(soup.title.get_text())
    if not title and og_title:
        title = _clean_text(og_title.get("content"))
    if not title or title.upper() == "TIENGIAY.VN":
        return None

    st = _parse_structured(soup, url, title)
    if st is not None:
        price_vnd, price_text = st["price_vnd"], st["price_text"]
        images, desc = st["images"], st["description"]
    else:  # dự phòng khi cấu trúc trang khác
        price_vnd, price_text = _find_price(soup, h1)
        images = _find_images(soup, h1, url) if h1 is not None else []
        desc = _find_description(soup, h1, title, price_text) if h1 is not None and h1.get_text(strip=True) else ""

    category_slug = None
    for a in soup.select("[class*=breadcrumb] a, [class*=duongdan] a, [class*=path] a"):
        s = slug_of(urljoin(url, a.get("href", "")))
        if s in CATEGORY_SLUGS:
            category_slug = s

    return {
        "url": url,
        "slug": slug_of(url),
        "title": title,
        "category_slug": category_slug,
        "price_vnd": price_vnd,
        "price_text": price_text,
        "description": desc,
        "images": images,
        "needs_review": price_text is None or not images,
    }
