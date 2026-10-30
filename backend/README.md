# Backend API (FastAPI)

Chạy trong PowerShell tại `E:\tiengiay\backend`:

```
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:DATABASE_URL = "postgresql://tiengiay:tiengiay_dev_2026@127.0.0.1:5432/tiengiay"
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Mở http://127.0.0.1:8000/docs để thử API.

| Đường dẫn | Mô tả |
|---|---|
| `GET /api/health` | kiểm tra kết nối DB, số sản phẩm |
| `GET /api/categories` | cây danh mục + số sản phẩm |
| `GET /api/products` | lọc `category`, `q`, `min_price`, `max_price`, `has_price`, `sort`, `page`, `page_size` |
| `GET /api/products/{slug}` | chi tiết, ảnh, breadcrumb, sản phẩm liên quan |
| `GET /api/suggest?q=` | gợi ý khi gõ ô tìm kiếm |
| `/media/...` | ảnh đã tải về (thư mục `data/images`) |

Luôn dùng `127.0.0.1` (không dùng `localhost`) trong DATABASE_URL.
