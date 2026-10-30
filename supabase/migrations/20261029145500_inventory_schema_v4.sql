CREATE OR REPLACE FUNCTION public.reset_products_sku_sequence()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    max_sku_number bigint;
BEGIN
    SELECT max((substring(p.sku FROM '^TG-([0-9]+)$'))::bigint)
    INTO max_sku_number
    FROM public.products AS p
    WHERE p.sku ~ '^TG-[0-9]+$';

    IF max_sku_number IS NULL THEN
        PERFORM pg_catalog.setval('public.products_sku_seq'::regclass, 1, false);
        RETURN 'TG-00001';
    END IF;

    PERFORM pg_catalog.setval(
        'public.products_sku_seq'::regclass,
        max_sku_number,
        true
    );

    RETURN 'TG-' || pg_catalog.lpad((max_sku_number + 1)::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.reset_products_sku_sequence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_products_sku_sequence() TO service_role;
