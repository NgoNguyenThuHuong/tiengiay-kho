CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL CHECK (length(btrim(sku)) > 0),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    price_vnd bigint NOT NULL CHECK (price_vnd >= 0),
    description text,
    notes text,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_tags (
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE public.product_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    object_key text NOT NULL UNIQUE,
    position integer NOT NULL CHECK (position >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, position)
);

CREATE UNIQUE INDEX products_sku_case_insensitive_idx
    ON public.products (lower(btrim(sku)));
CREATE INDEX products_name_trgm_idx
    ON public.products USING gin (name extensions.gin_trgm_ops);
CREATE INDEX products_sku_trgm_idx
    ON public.products USING gin (sku extensions.gin_trgm_ops);
CREATE INDEX products_category_id_idx ON public.products(category_id);
CREATE INDEX products_brand_id_idx ON public.products(brand_id);
CREATE INDEX product_tags_tag_id_idx ON public.product_tags(tag_id);
CREATE INDEX product_images_product_id_idx ON public.product_images(product_id);

CREATE FUNCTION public.set_product_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.set_product_updated_at();

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    public.categories,
    public.brands,
    public.products,
    public.tags,
    public.product_tags,
    public.product_images
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.categories,
    public.brands,
    public.products,
    public.tags,
    public.product_tags,
    public.product_images
TO authenticated;

CREATE POLICY "authenticated users manage categories"
    ON public.categories FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users manage brands"
    ON public.brands FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users manage products"
    ON public.products FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users manage tags"
    ON public.tags FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users manage product tags"
    ON public.product_tags FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users manage product images"
    ON public.product_images FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
