CREATE SEQUENCE public.products_sku_seq AS bigint;
ALTER SEQUENCE public.products_sku_seq OWNED BY public.products.sku;

DO $$
DECLARE
    max_sku_number bigint;
BEGIN
    SELECT max(substring(sku FROM '^TG-([0-9]+)$')::bigint)
    INTO max_sku_number
    FROM public.products
    WHERE sku ~ '^TG-[0-9]+$';

    IF max_sku_number IS NULL THEN
        PERFORM setval('public.products_sku_seq', 1, false);
    ELSE
        PERFORM setval('public.products_sku_seq', max_sku_number, true);
    END IF;
END;
$$;

ALTER TABLE public.products
    ALTER COLUMN sku SET DEFAULT (
        'TG-' || lpad(nextval('public.products_sku_seq')::text, 5, '0')
    ),
    ALTER COLUMN price_vnd DROP NOT NULL,
    ADD COLUMN price_text text,
    ADD COLUMN slug text UNIQUE,
    ADD COLUMN source_url text;

ALTER TABLE public.categories
    ADD COLUMN slug text UNIQUE,
    ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.product_images
    ADD COLUMN source_url text;

REVOKE ALL ON SEQUENCE public.products_sku_seq FROM PUBLIC, anon;
GRANT USAGE, SELECT ON SEQUENCE public.products_sku_seq TO authenticated;
