export interface Product {
  id: string;
  sku: string;
  name: string;
  price_vnd: number | null;
  price_text: string | null;
  description: string | null;
  notes: string | null;
  category_id: string | null;
  brand_id: string | null;
  created_at: string;
  updated_at: string;
  slug: string | null;
  source_url: string | null;
  needs_photos: boolean;
  category?: Category | null;
  primary_image?: string | null;
}

export interface ProductImage {
  id: string;
  product_id: string;
  object_key: string;
  position: number;
  source_url?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

