# Tiengiay Scraper & Database Setup

Đây là công cụ thu thập dữ liệu sản phẩm từ website tiengiay.vn để lưu trữ vào database, phục vụ cho quá trình xây dựng nền tảng mới.

## Yêu cầu
- Python 3.9+
- Docker và Docker Compose

## Cài đặt

1. **Tạo virtual environment và cài đặt thư viện Python:**
   ```bash
   cd scraper
   python -m venv .venv
   .venv\Scripts\activate  # Nếu dùng Linux/Mac: source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Cấu hình môi trường:**
   Tạo file `.env` từ file `.env.example` ở thư mục gốc của dự án:
   ```bash
   cd ..
   cp .env.example .env
   ```
   *Lưu ý: Không thay đổi nếu chỉ chạy local.*

3. **Khởi động PostgreSQL Database:**
   Tại thư mục gốc dự án:
   ```bash
   cd infra
   docker-compose up -d
   ```
   - Database sẽ chạy trên port `5432`.
   - Script khởi tạo schema `database/schema.sql` sẽ tự động chạy trong lần tạo volume đầu tiên.

## Kiểm thử

Chạy bài kiểm thử cho parser để đảm bảo nhận diện đúng cấu trúc HTML:
```bash
cd scraper
python test_parser.py
```

## Chạy Scraper

Công cụ cạo dữ liệu có các lệnh theo trình tự:

1. **Quét danh mục:** Lấy danh sách URL sản phẩm.
   ```bash
   python scrape.py lists
   ```
2. **Quét chi tiết sản phẩm:** Có thể dùng `--limit` để giới hạn số lượng và `--dry-run` để chỉ in kết quả ra màn hình mà không ghi vào DB.
   ```bash
   python scrape.py products --limit 3 --dry-run
   python scrape.py products  # Chạy thật
   ```
3. **Tải ảnh:**
   ```bash
   python scrape.py images --limit 3
   ```
   Kiểm tra ảnh đã tải mà không gửi yêu cầu mạng:
   ```bash
   python scrape.py images --repair --dry-run
   ```
   Lệnh sửa ảnh chỉ tải lại tệp thiếu/hỏng, kiểm tra `Content-Type` và nội dung bằng Pillow,
   giữ nguyên ảnh hợp lệ, giới hạn tốc độ khoảng 1 yêu cầu/giây và thử lại với URL ảnh từ trang sản phẩm.
   Chỉ chạy tải thật sau khi đã xem kết quả dry-run và xác nhận:
   ```bash
   python scrape.py images --repair
   ```
4. **Xem thống kê:**
   ```bash
   python scrape.py stats
   ```

## Kiểm tra Database

Sau khi cạo dữ liệu thành công, bạn có thể kiểm tra PostgreSQL bằng DBeaver hoặc psql:
```bash
docker exec -it tiengiay-postgres psql -U tiengiay -d tiengiay -c "SELECT title, price_text FROM products LIMIT 5;"
```

## Import kho lên Supabase và Cloudflare R2

Lệnh import chỉ đọc `data/export/` và dùng `.env` tại thư mục gốc. Tạo `.env` từ
`.env.example`, điền thông tin R2/Supabase cục bộ; không đưa `SUPABASE_SERVICE_ROLE_KEY`
vào frontend hoặc commit `.env`.

Trước khi import thật, chạy migration v2, v3 và v4 trong `supabase/migrations/`.
Sau khi cài dependencies trong virtual environment:

```bash
python scraper/import_to_supabase.py --dry-run
```

Dry-run kiểm tra toàn bộ CSV/WebP và chỉ đếm, không tải credentials, kết nối mạng
hay ghi dữ liệu. Chạy import thử 10 sản phẩm chỉ sau khi duyệt dry-run:

```bash
python scraper/import_to_supabase.py --limit 10
```

Sau khi kiểm tra các URL ảnh thử, chạy toàn bộ chỉ khi đã được duyệt riêng:

```bash
python scraper/import_to_supabase.py
```

Import upsert danh mục/sản phẩm/ảnh; object R2 đã tồn tại và đúng Content-Type sẽ
được giữ lại. Lượt import toàn bộ xác minh sequence SKU tiếp theo và đối chiếu
số sản phẩm, ảnh trong Supabase cùng object trong bucket với CSV.

## Lưu ý trước khi chạy thật

1. **Quyền riêng tư & Bản quyền:** Đảm bảo bạn có quyền thu thập và sử dụng dữ liệu từ website đích.
2. **Kiểm tra Parser:** Chạy `python scrape.py inspect <URL>` đối với trang thật để chắc chắn parser đang hoạt động chính xác trước khi cạo diện rộng.
