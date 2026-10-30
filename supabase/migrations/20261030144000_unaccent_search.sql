-- Migration v5: Tìm kiếm không dấu (unaccent) cho products (tên và SKU)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Hàm tìm kiếm hỗ trợ không dấu và case-insensitive
CREATE OR REPLACE FUNCTION public.search_products(
    search_query text,
    category_slug_filter text DEFAULT NULL,
    needs_photos_filter boolean DEFAULT NULL,
    tag_id_filter uuid DEFAULT NULL,
    page_number integer DEFAULT 1,
    page_size integer DEFAULT 24
)
RETURNS TABLE (
    id uuid,
    sku text,
    name text,
    price_vnd bigint,
    price_text text,
    description text,
    notes text,
    category_id uuid,
    brand_id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    slug text,
    source_url text,
    needs_photos boolean,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    normalized_query text;
BEGIN
    normalized_query := btrim(search_query);

    RETURN QUERY
    WITH filtered AS (
        SELECT
            p.id,
            p.sku,
            p.name,
            p.price_vnd,
            p.price_text,
            p.description,
            p.notes,
            p.category_id,
            p.brand_id,
            p.created_at,
            p.updated_at,
            p.slug,
            p.source_url,
            p.needs_photos
        FROM public.products p
        LEFT JOIN public.categories c ON p.category_id = c.id
        LEFT JOIN public.product_tags pt ON p.id = pt.product_id
        WHERE
            (
                normalized_query IS NULL
                OR normalized_query = ''
                OR extensions.unaccent(p.name) ILIKE '%' || extensions.unaccent(normalized_query) || '%'
                OR p.sku ILIKE '%' || normalized_query || '%'
            )
            AND (
                category_slug_filter IS NULL
                OR category_slug_filter = ''
                OR c.slug = category_slug_filter
            )
            AND (
                needs_photos_filter IS NULL
                OR p.needs_photos = needs_photos_filter
            )
            AND (
                tag_id_filter IS NULL
                OR pt.tag_id = tag_id_filter
            )
        GROUP BY p.id
    ),
    counted AS (
        SELECT COUNT(*)::bigint AS full_count FROM filtered
    )
    SELECT
        f.id,
        f.sku,
        f.name,
        f.price_vnd,
        f.price_text,
        f.description,
        f.notes,
        f.category_id,
        f.brand_id,
        f.created_at,
        f.updated_at,
        f.slug,
        f.source_url,
        f.needs_photos,
        c.full_count AS total_count
    FROM filtered f
    CROSS JOIN counted c
    ORDER BY f.sku ASC
    OFFSET GREATEST(0, (page_number - 1) * page_size)
    LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_products(text, text, boolean, uuid, integer, integer) TO authenticated;

