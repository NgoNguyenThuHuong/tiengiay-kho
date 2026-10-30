# Kế hoạch dự án: Dựng lại web tiengiay.vn + tích hợp AI

*Ngày lập: 03/10/2026. Các con số chi phí/thời gian là ước tính thô, cần điều chỉnh khi có yêu cầu thật.*

---

## 1. Mục tiêu

Dựng lại web chợ sưu tầm tiền, xu, tem và đồ xưa, **giữ nguyên giao diện hiện tại**, chạy ổn với **20.000 sản phẩm**, và bổ sung:

- Chat AI giải thích sản phẩm cho khách.
- AI hỗ trợ đăng bài nhanh (chụp ảnh → tự điền thông tin) và gợi ý keyword.
- Hệ thống quảng cáo (chạy ads cho web và/hoặc bán chỗ banner).

## 2. Hiện trạng web cũ (tiengiay.vn)

- Các danh mục chính: Tiền Xưa Việt Nam, Xu Việt Nam, Tem Xưa Việt Nam, Tiền Quốc tế, Xu Quốc tế, PMG Banknote, Nhạc Tờ Xưa, Giấy Tờ & Trái Phiếu Xưa, Vé Số Xưa, Bưu Ảnh Xưa, Đồ xưa & Decor.
- Tính năng: đăng ký/đăng nhập, giỏ hàng, đấu giá, gian hàng (shop), đăng tin, form đăng ký quảng cáo, song ngữ Việt/Anh.
- Chân trang ghi "Design by MEOCONDTS.COM" → template có thể thuộc bản quyền bên thứ ba.
- Nhiều sản phẩm để giá "Thỏa thuận".

## 3. Tình huống & ràng buộc

- Không có quyền truy cập database, mã nguồn hay hosting của web cũ; không cần chủ cũ hỗ trợ.
- Chỉ lấy được **dữ liệu công khai** (tên, giá, mô tả, ảnh, danh mục) bằng scraper. **Không có**: tài khoản/mật khẩu, đơn hàng, lịch sử đấu giá, dữ liệu riêng của shop.
- Domain tiengiay.vn chưa rõ ai đang giữ → làm web trước trên domain tạm, quyết domain sau.

**Lưu ý pháp lý/rủi ro:**
- Lưu văn bản/tin nhắn xác nhận quyền nhượng quyền (web, dữ liệu, domain).
- Không copy nguyên mã template của bên thiết kế cũ; tự viết lại giao diện.
- Ảnh và mô tả có thể thuộc về người bán → cần điều khoản sử dụng rõ ràng.
- Nếu dùng domain mới: mất thứ hạng Google, nên đổi tên thương hiệu/logo, không chạy bản giống y hệt khi web cũ còn hoạt động.

## 4. Công nghệ đề xuất

| Thành phần | Lựa chọn |
|---|---|
| Frontend | Next.js (render phía server, tốt SEO) |
| Backend | NestJS (Node) |
| Database | PostgreSQL + Redis |
| Tìm kiếm | Meilisearch |
| Vector (chat AI) | pgvector |
| Lưu ảnh | Cloudflare R2 (hoặc S3) |
| AI | Claude API |
| Triển khai | Docker Compose, Nginx, Cloudflare (CDN + SSL) |

## 5. Hạ tầng cần thuê

- **Domain:** giữ tiengiay.vn nếu lấy lại được; nếu không, dùng domain mới (.com ~300–400k/năm, .vn vài trăm nghìn/năm). Tra chủ sở hữu trên VNNIC.
- **VPS:** ~4 vCPU, 8GB RAM, SSD 100GB+ (Viettel IDC, BKNS, Nhân Hòa, hoặc Vultr/DigitalOcean Singapore).
- **Lưu ảnh:** Cloudflare R2/S3 (ước tính 60–100 nghìn ảnh).
- **Cloudflare:** bản miễn phí đủ lúc đầu.
- **Backup:** tự động hằng ngày, lưu ngoài VPS.
- **Tài khoản:** Anthropic API, Google Merchant Center, Facebook/TikTok Pixel, Zalo Ads (cho giai đoạn quảng cáo).

## 6. Cấu trúc project

```
tiengiay/
├── frontend/        # Next.js: giao diện người dùng + trang admin
├── backend/         # NestJS API
│   └── modules/
│       ├── auth/        # đăng ký, đăng nhập, phân quyền
│       ├── products/    # sản phẩm, danh mục, ảnh
│       ├── auctions/    # đấu giá
│       ├── shops/       # gian hàng
│       ├── cart-orders/ # giỏ hàng, đơn hàng
│       ├── ads/         # banner, đăng ký quảng cáo
│       └── ai/          # đăng bài từ ảnh, chat, keyword
├── scraper/         # script lấy dữ liệu công khai từ web cũ
├── infra/           # docker-compose, nginx, backup
└── docs/            # tài liệu, quy ước
```

## 7. Các giai đoạn thực hiện

### Giai đoạn 0 – Chuẩn bị (~1 tuần)
1. Tra domain tiengiay.vn trên VNNIC.
2. Lưu văn bản xác nhận quyền nhượng quyền.
3. Chọn domain tạm, thuê VPS, tạo tài khoản Cloudflare, R2, Anthropic API.
4. Chụp lại toàn bộ trang web cũ (trang chủ, danh mục, chi tiết, đăng tin, giỏ hàng) làm mẫu giao diện.

### Giai đoạn 1 – Nền tảng: infra + backend
1. Dựng Docker Compose: Postgres, Redis, Meilisearch, backend, frontend.
2. Thiết kế database: người dùng, danh mục (cây nhiều cấp), sản phẩm, ảnh, gian hàng, đấu giá, đơn hàng, banner.
3. API: auth, danh mục, sản phẩm (lọc/sắp xếp/phân trang), giỏ hàng, đơn hàng.
4. Upload ảnh lên R2, tự tạo ảnh thu nhỏ.
5. Đồng bộ sản phẩm vào Meilisearch.
6. Backup Postgres hằng ngày ra ngoài VPS.

### Giai đoạn 2 – Frontend (giữ nguyên giao diện)
1. Layout: header, menu danh mục nhiều cấp, banner, footer.
2. Trang chủ: các khối theo danh mục, đấu giá, gian hàng.
3. Trang danh mục, chi tiết sản phẩm, tìm kiếm, giỏ hàng, thanh toán.
4. Đăng ký/đăng nhập, quên mật khẩu, trang tài khoản.
5. Đăng tin, quản lý tin của tôi, trang gian hàng.
6. Đấu giá: đặt giá, đếm ngược.
7. Song ngữ Việt/Anh, tối ưu điện thoại, SEO (URL thân thiện, sitemap, meta).
8. Trang admin: duyệt bài, quản lý người dùng, banner, đơn hàng.

*(Giai đoạn 1 + 2: khoảng 6–8 tuần.)*

### Giai đoạn 3 – Dữ liệu (scraper)
1. Script đi từ trang danh mục vào từng sản phẩm, lấy tên, giá, mô tả, ảnh, danh mục.
2. Chạy chậm (khoảng 1–2 yêu cầu/giây), lưu trạng thái để dừng/chạy tiếp.
3. Làm sạch: chuẩn hóa tiêu đề, giá, danh mục, bỏ trùng.
4. Tải ảnh lên R2, nhập database, đồng bộ Meilisearch.
5. Kiểm tra mẫu ngẫu nhiên khoảng 200 sản phẩm.

### Giai đoạn 4 – AI (~3–4 tuần đăng bài + ~2 tuần chat)
1. **Đăng bài từ ảnh:** gửi ảnh cho Claude, trả về JSON gồm tiêu đề, danh mục, năm, mệnh giá, mô tả, tag. Người đăng sửa rồi xác nhận.
2. **Gợi ý keyword:** từ điển lấy từ dữ liệu web, gợi ý khi gõ, tag song ngữ. Tiêu đề theo mẫu cố định "Quốc gia/Thời kỳ – Mệnh giá – Năm".
3. **Đăng hàng loạt:** nhập Excel + ZIP ảnh, nhân bản bài, cảnh báo trùng.
4. **Chat khách hàng:** tạo vector cho 20.000 sản phẩm (pgvector); khi khách hỏi thì tìm sản phẩm liên quan, đưa cho Claude trả lời kèm link.
5. Giới hạn số lượt chat theo khách/IP, lưu nhật ký, có dòng "chỉ mang tính tham khảo".
6. **AI không tự khẳng định thật/giả hay tự định giá.** Luôn có bước người đăng xác nhận; người mới đăng cần admin duyệt.

### Giai đoạn 5 – Quảng cáo (~2–3 tuần)
1. Module banner: vị trí, thời hạn, đếm lượt xem/click, báo cáo.
2. Form "Đăng ký quảng cáo" lưu vào admin.
3. Feed sản phẩm cho Google Merchant, gắn Pixel (Facebook/TikTok), Google Analytics.

### Giai đoạn 6 – Kiểm thử & ra mắt
1. Kiểm thử luồng chính: đăng ký, đăng bài, mua hàng, đấu giá, chat.
2. Kiểm tra tốc độ với 20.000 sản phẩm (tìm kiếm, trang danh mục).
3. Bảo mật: giới hạn tần suất, chống spam đăng bài, kiểm tra upload ảnh, HTTPS.
4. Chốt domain, trỏ DNS, bật giám sát uptime và log lỗi.
5. Thông báo cho khách và các shop (Zalo, Facebook).

## 8. Thứ tự ưu tiên khi gấp

Giai đoạn 1 → 3 → 2 → 4 (đăng bài từ ảnh) → phần còn lại. Có dữ liệu và giao diện chạy được trước, rồi mới thêm AI và quảng cáo.

## 9. Chiến lược domain

- **Lúc phát triển:** dùng domain tạm hoặc subdomain; để tên miền trong file cấu hình (không gắn cứng); bật `noindex` cho bản thử.
- **Nếu lấy lại được tiengiay.vn:** chỉ cần trỏ DNS sang server mới, giữ thứ hạng Google và khách cũ (phương án tốt nhất).
- **Nếu không lấy được:** dùng domain mới, đổi thương hiệu, làm SEO lại, thông báo khách và shop.

## 10. Dự toán thô

**Thời gian:** khoảng 3,5–4,5 tháng, tương đương 5–8 người-tháng (1–2 lập trình viên).

**Chi phí chạy hằng tháng** (sau khi lên web):

| Khoản | Ước tính |
|---|---|
| VPS | 0,5–1,5 triệu |
| Lưu ảnh (R2/S3) + backup | 0,2–0,5 triệu |
| Cloudflare | Miễn phí (Pro ~500k nếu cần) |
| Domain | vài trăm nghìn/năm |
| Claude API – đăng bài | ~500–1.000đ/bài (1.000 bài/tháng < 1 triệu) |
| Claude API – chat khách | ~1–3 triệu tùy lượng khách |
| **Tổng** | **~2–6 triệu/tháng** (chưa tính ngân sách ads) |

**Khoản dễ bị quên:** phí cổng thanh toán, email giao dịch, thiết kế lại để giữ y giao diện, thời gian làm sạch dữ liệu.

**Cách giảm chi phí:** làm giai đoạn 1–3 trước và chạy thử với nhóm người đăng nhỏ; để Meilisearch chạy chung VPS lúc đầu; giới hạn lượt chat AI theo khách.

## 11. Rủi ro & cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Không có dữ liệu gốc (tài khoản, đơn hàng) | Người dùng đăng ký lại, liên hệ shop cấp lại gian hàng |
| Không lấy lại được domain | Dùng domain mới, đổi thương hiệu, thông báo khách |
| Tranh chấp bản quyền giao diện/nội dung | Tự viết lại giao diện, giữ văn bản nhượng quyền, điều khoản cho người đăng |
| Ảnh nặng làm web chậm | R2 + CDN, tạo ảnh thu nhỏ, lazy-load |
| AI nhận sai năm/loại tiền | Người đăng luôn xác nhận, admin duyệt, AI không kết luận thật/giả |
| Spam đăng bài, lạm dụng chat | Giới hạn tần suất, duyệt người mới, chống bot |

## 12. Việc cần làm ngay

- [ ] Tra chủ sở hữu domain tiengiay.vn trên VNNIC.
- [ ] Lưu văn bản xác nhận nhượng quyền.
- [ ] Chọn domain tạm và nhà cung cấp VPS.
- [ ] Chụp lại giao diện web cũ làm mẫu.
- [ ] Bắt đầu thiết kế database và viết scraper.
