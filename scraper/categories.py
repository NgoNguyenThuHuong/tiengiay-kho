"""Cây danh mục (lấy từ menu 'Danh mục sản phẩm' của tiengiay.vn).
Mỗi phần tử: (slug, tên, slug_cha)
"""

CATEGORIES = [
    ("tien-xua-viet-nam", "Tiền Xưa Việt Nam", None),
    ("north-vietnam-1946-1975", "North Vietnam (1946-1975)", "tien-xua-viet-nam"),
    ("south-vietnam-1955-1975", "South Vietnam (1955-1975)", "tien-xua-viet-nam"),
    ("vietnam-1976--now", "Vietnam (1976 - Now)", "tien-xua-viet-nam"),
    ("french-indochine-1874-1954", "French Indochine (1874-1954)", "tien-xua-viet-nam"),

    ("xu-viet-nam", "Xu Việt Nam", None),

    ("tem-xua-viet-nam", "Tem Xưa Việt Nam", None),
    ("mien-nam-1951-1975", "Miền Nam (1951-1975)", "tem-xua-viet-nam"),
    ("mien-bac-1946--1975", "Miền Bắc (1946 - 1975)", "tem-xua-viet-nam"),
    ("thong-nhat-1975--nay", "Thống Nhất (1975 - Nay)", "tem-xua-viet-nam"),
    ("dong-duong-1863--1945", "Đông Dương (1863 - 1945)", "tem-xua-viet-nam"),

    ("tien-quoc-te", "Tiền Quốc tế", None),
    ("chau-a-asia", "Châu Á (Asia)", "tien-quoc-te"),
    ("chau-phi-africa", "Châu Phi (Africa)", "tien-quoc-te"),
    ("chau-au-europe", "Châu Âu (Europe)", "tien-quoc-te"),
    ("chau-bac-my-north-america", "Châu Bắc Mỹ (North America)", "tien-quoc-te"),
    ("chau-nam-my-south-america", "Châu Nam Mỹ (South America)", "tien-quoc-te"),
    ("chau-dai-duong-oceania", "Châu Đại Dương (Oceania)", "tien-quoc-te"),
    ("chau-nam-cuc-antarctica", "Châu Nam Cực (Antarctica)", "tien-quoc-te"),

    ("xu-quoc-te", "Xu Quốc tế", None),
    ("pmg-banknote", "PMG Banknote", None),
    ("nhac-to-xua-viet-nam", "Nhạc Tờ Xưa Việt Nam", None),

    ("giay-to-trai-phieu-xua", "Giấy Tờ & Trái Phiếu Xưa", None),
    ("hoa-don--chi-phieu--sec", "Hoá Đơn - Chi Phiếu - Séc", "giay-to-trai-phieu-xua"),
    ("cong-kho-phieu--cong-trai--co-phieu", "Công Khố Phiếu - Công Trái - Cổ Phiếu", "giay-to-trai-phieu-xua"),
    ("giay-to-tu-than--chung-chi--bang-khen", "Giấy Tờ Tự Thân - Chứng Chỉ - Bằng Khen", "giay-to-trai-phieu-xua"),

    ("ve-so-viet-nam-xua-lottery-tickets", "Vé Số Việt Nam Xưa (Lottery Tickets)", None),
    ("buu-anh-xua-cartesouvenir", "Bưu Ảnh Xưa (CarteSouvenir)", None),
    ("do-xua-decor", "Đồ xưa & Decor", None),
]

CATEGORY_SLUGS = {c[0] for c in CATEGORIES}

# Các đường dẫn 1 cấp KHÔNG phải trang sản phẩm
RESERVED_SLUGS = CATEGORY_SLUGS | {
    "dang-ky", "dang-nhap", "dang-xuat", "quen-mat-khau", "gio-hang", "dang-tin",
    "chinh-sach", "ho-tro-khach-hang", "cham-soc-khach-hang", "chinh-sach-tra-hang",
    "chinh-sach-quy-dinh-website", "gioi-thieu", "huong-dan", "lien-he",
    "san-pham", "san-pham-dau-gia", "tat-ca-gian-hang", "tim-kiem", "thanh-toan",
}


def crawl_order():
    """Danh mục con trước, danh mục cha sau -> sản phẩm gán vào danh mục sâu nhất."""
    children = [c[0] for c in CATEGORIES if c[2] is not None]
    parents = [c[0] for c in CATEGORIES if c[2] is None]
    return children + parents
