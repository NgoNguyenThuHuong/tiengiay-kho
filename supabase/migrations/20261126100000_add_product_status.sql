-- Migration v6: Thêm trường trạng thái (status) cho sản phẩm (products)
-- Giá trị hợp lệ: cho_duyet, da_duyet, da_dang, da_ban, tam_an
-- Dữ liệu cũ nhận mặc định 'da_dang', dữ liệu mới tạo từ nay về sau nhận 'cho_duyet'

-- 1. Thêm cột status với mặc định tạm thời là 'da_dang' để gán cho toàn bộ sản phẩm hiện có
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'da_dang';

-- 2. Thêm ràng buộc kiểm tra giá trị hợp lệ (an toàn nếu chạy lại)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_status_check'
    ) THEN
        ALTER TABLE public.products
            ADD CONSTRAINT products_status_check
            CHECK (status IN ('cho_duyet', 'da_duyet', 'da_dang', 'da_ban', 'tam_an'));
    END IF;
END;
$$;

-- 3. Đổi giá trị mặc định của cột status sang 'cho_duyet' cho các sản phẩm thêm mới sau này
ALTER TABLE public.products
    ALTER COLUMN status SET DEFAULT 'cho_duyet';

-- 4. Tạo index hỗ trợ lọc nhanh theo trạng thái
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products (status);
