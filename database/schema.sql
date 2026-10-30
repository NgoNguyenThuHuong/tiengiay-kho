-- Schema giai đoạn 1 (dữ liệu sản phẩm). Người dùng/đấu giá/đơn hàng sẽ thêm sau.
CREATE EXTENSION IF NOT EXISTS vector;     -- dùng cho chat AI sau này
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- tìm kiếm gần đúng
CREATE EXTENSION IF NOT EXISTS unaccent;   -- tìm không dấu

CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id            BIGSERIAL PRIMARY KEY,
    slug          TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    price_vnd     BIGINT,                      -- NULL nếu "Thỏa thuận"
    price_text    TEXT,                        -- nguyên văn: "550.000đ" / "Thỏa thuận"
    description   TEXT,
    source_url    TEXT,
    status        TEXT NOT NULL DEFAULT 'active',  -- active | hidden | sold | pending
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    local_path  TEXT,          -- đường dẫn ảnh đã tải về
    source_url  TEXT,          -- URL gốc trên web cũ
    cdn_url     TEXT,          -- điền sau khi đưa lên R2/S3
    UNIQUE (product_id, position)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON products USING gin (title gin_trgm_ops);
