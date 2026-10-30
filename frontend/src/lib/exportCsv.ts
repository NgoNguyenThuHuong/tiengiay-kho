import { supabase } from './supabase';

/**
 * Escapes a cell according to RFC 4180 and protects against CSV formula injection.
 * If isNumericCol is true and value is a number, it will not be prefixed with single quote.
 */
export function escapeCsvCell(val: any, isNumericCol: boolean = false): string {
  if (val === null || val === undefined) {
    return '';
  }

  if (isNumericCol) {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? String(val) : '';
    }
    const strVal = String(val).trim();
    if (/^-?\d+(\.\d+)?$/.test(strVal)) {
      return strVal;
    }
  }

  let str = String(val);

  // Anti-CSV formula injection: if text cell starts with =, +, -, @, or tab (\t)
  if (/^[=+\-@\t]/.test(str)) {
    str = "'" + str;
  }

  // RFC 4180: if cell contains quotes, comma, or newline, wrap in quotes and escape quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Helper to download CSV with UTF-8 BOM
 */
export function downloadCsvFile(filename: string, csvContent: string) {
  // UTF-8 BOM: \uFEFF ensures Excel renders Vietnamese characters correctly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ExportResult {
  productCount: number;
  expectedProductCount: number;
  imageCount: number;
  expectedImageCount: number;
}

/**
 * Exports products and product_images to 2 CSV files via batch pagination
 */
export async function exportAllDataToCsv(
  onProgress?: (status: string) => void
): Promise<ExportResult> {
  const PAGE_SIZE = 1000;

  // 1. Fetch all products in batches of 1000
  onProgress?.('Đang tải danh sách sản phẩm...');
  const allProducts: any[] = [];
  let pFrom = 0;
  let pHasMore = true;
  let expectedProductCount: number | null = null;

  while (pHasMore) {
    const pTo = pFrom + PAGE_SIZE - 1;
    const { data, count, error } = await supabase
      .from('products')
      .select(`
        id,
        sku,
        slug,
        name,
        price_vnd,
        price_text,
        description,
        notes,
        source_url,
        needs_photos,
        categories ( slug ),
        product_tags ( tags ( name ) )
      `, { count: 'exact' })
      .order('sku', { ascending: true })
      .range(pFrom, pTo);

    if (error) {
      throw new Error(`Lỗi tải sản phẩm (lô ${pFrom}-${pTo}): ${error.message}`);
    }

    if (expectedProductCount === null && count !== null) {
      expectedProductCount = count;
    }

    if (data && data.length > 0) {
      allProducts.push(...data);
      onProgress?.(`Đang tải sản phẩm: ${allProducts.length}/${expectedProductCount ?? '...'}...`);
      pFrom += PAGE_SIZE;
      if (data.length < PAGE_SIZE) {
        pHasMore = false;
      }
    } else {
      pHasMore = false;
    }
  }

  if (expectedProductCount !== null && allProducts.length !== expectedProductCount) {
    throw new Error(
      `LỆCH SỐ LIỆU SẢN PHẨM: Đã lấy được ${allProducts.length} dòng nhưng Supabase đếm tổng cộng ${expectedProductCount} sản phẩm!`
    );
  }

  // 2. Fetch all product_images in batches of 1000
  onProgress?.('Đang tải danh sách hình ảnh...');
  const allImages: any[] = [];
  let iFrom = 0;
  let iHasMore = true;
  let expectedImageCount: number | null = null;

  while (iHasMore) {
    const iTo = iFrom + PAGE_SIZE - 1;
    const { data, count, error } = await supabase
      .from('product_images')
      .select(`
        id,
        position,
        object_key,
        products!product_id ( slug )
      `, { count: 'exact' })
      .order('id', { ascending: true })
      .range(iFrom, iTo);

    if (error) {
      throw new Error(`Lỗi tải hình ảnh (lô ${iFrom}-${iTo}): ${error.message}`);
    }

    if (expectedImageCount === null && count !== null) {
      expectedImageCount = count;
    }

    if (data && data.length > 0) {
      allImages.push(...data);
      onProgress?.(`Đang tải hình ảnh: ${allImages.length}/${expectedImageCount ?? '...'}...`);
      iFrom += PAGE_SIZE;
      if (data.length < PAGE_SIZE) {
        iHasMore = false;
      }
    } else {
      iHasMore = false;
    }
  }

  if (expectedImageCount !== null && allImages.length !== expectedImageCount) {
    throw new Error(
      `LỆCH SỐ LIỆU HÌNH ẢNH: Đã lấy được ${allImages.length} dòng nhưng Supabase đếm tổng cộng ${expectedImageCount} hình ảnh!`
    );
  }

  // 3. Build products.csv
  onProgress?.('Đang chuẩn bị file products.csv...');
  const productHeaders = [
    'sku',
    'slug',
    'name',
    'price_vnd',
    'price_text',
    'description',
    'notes',
    'category_slug',
    'tags',
    'source_url',
    'needs_photos',
  ];

  const productRows = allProducts.map((p) => {
    const catSlug = p.categories?.slug ?? '';
    const tagNames = (p.product_tags || [])
      .map((pt: any) => pt.tags?.name)
      .filter(Boolean)
      .join(', ');

    return [
      escapeCsvCell(p.sku),
      escapeCsvCell(p.slug),
      escapeCsvCell(p.name),
      escapeCsvCell(p.price_vnd, true),
      escapeCsvCell(p.price_text),
      escapeCsvCell(p.description),
      escapeCsvCell(p.notes),
      escapeCsvCell(catSlug),
      escapeCsvCell(tagNames),
      escapeCsvCell(p.source_url),
      escapeCsvCell(p.needs_photos ? 'true' : 'false'),
    ].join(',');
  });

  const productsCsvContent = [productHeaders.join(','), ...productRows].join('\r\n');

  // 4. Build product_images.csv
  onProgress?.('Đang chuẩn bị file product_images.csv...');
  const imageHeaders = ['slug', 'position', 'object_key'];

  const imageRows = allImages.map((img) => {
    const slug = img.products?.slug ?? '';
    return [
      escapeCsvCell(slug),
      escapeCsvCell(img.position, true),
      escapeCsvCell(img.object_key),
    ].join(',');
  });

  const imagesCsvContent = [imageHeaders.join(','), ...imageRows].join('\r\n');

  // 5. Trigger download for both files with a slight gap
  onProgress?.('Đang tải file products.csv...');
  downloadCsvFile('products.csv', productsCsvContent);

  await new Promise((resolve) => setTimeout(resolve, 600));

  onProgress?.('Đang tải file product_images.csv...');
  downloadCsvFile('product_images.csv', imagesCsvContent);

  return {
    productCount: allProducts.length,
    expectedProductCount: expectedProductCount ?? allProducts.length,
    imageCount: allImages.length,
    expectedImageCount: expectedImageCount ?? allImages.length,
  };
}

