import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { ProductCard } from '../components/ProductCard';
import { Pagination } from '../components/Pagination';
import type { Product, Category, Tag } from '../types';
import { exportAllDataToCsv } from '../lib/exportCsv';
import {
  Search,
  Filter,
  Camera,
  LogOut,
  RefreshCw,
  Package,
  Layers,
  AlertCircle,
  X,
  Plus,
  Download,
  CheckCircle2,
} from 'lucide-react';

const PAGE_SIZE = 24;

export const ProductListPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const qParam = searchParams.get('q') || '';
  const categoryParam = searchParams.get('category') || '';
  const tagParam = searchParams.get('tag') || '';
  const needsPhotosParam = searchParams.get('needs_photos') === 'true';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  // Local state
  const [searchTerm, setSearchTerm] = useState(qParam);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Statistics
  const [totalInventory, setTotalInventory] = useState<number | null>(null);
  const [totalNeedsPhotos, setTotalNeedsPhotos] = useState<number | null>(null);

  // Query state
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Export CSV state
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportNotification, setExportNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleExportCsv = async () => {
    if (!user) {
      setExportNotification({
        type: 'error',
        message: 'Bạn cần đăng nhập để xuất dữ liệu CSV.',
      });
      return;
    }

    setIsExporting(true);
    setExportStatus('Đang kết nối...');
    setExportNotification(null);

    try {
      const result = await exportAllDataToCsv((status) => {
        setExportStatus(status);
      });

      setExportNotification({
        type: 'success',
        message: `Xuất CSV thành công! Đã xuất products.csv (${result.productCount}/${result.expectedProductCount} sản phẩm) và product_images.csv (${result.imageCount}/${result.expectedImageCount} hình ảnh). Dữ liệu khớp 100% với Supabase.`,
      });
    } catch (err: any) {
      console.error('Lỗi xuất CSV:', err);
      setExportNotification({
        type: 'error',
        message: err.message || 'Lỗi không xác định khi xuất CSV.',
      });
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  };

  // Sync debounced search to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      params.set('q', debouncedSearch);
    } else {
      params.delete('q');
    }
    // Reset page to 1 when search text changes
    if (debouncedSearch !== qParam) {
      params.set('page', '1');
    }
    setSearchParams(params, { replace: true });
  }, [debouncedSearch]);

  // Load Categories, Tags and Initial Total Stats
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [catRes, tagRes, totalProdRes, totalPhotosRes] = await Promise.all([
          supabase.from('categories').select('id, name, slug, parent_id').order('name'),
          supabase.from('tags').select('id, name').order('name'),
          supabase.from('products').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('needs_photos', true),
        ]);

        if (catRes.data) setCategories(catRes.data);
        if (tagRes.data) setTags(tagRes.data);
        if (totalProdRes.count !== null) setTotalInventory(totalProdRes.count);
        if (totalPhotosRes.count !== null) setTotalNeedsPhotos(totalPhotosRes.count);
      } catch (err) {
        console.error('Error fetching metadata:', err);
      }
    };

    fetchMetadata();
  }, []);

  // Fetch Products based on current filters and pagination
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('products')
        .select(`
          id,
          sku,
          name,
          price_vnd,
          price_text,
          description,
          notes,
          category_id,
          brand_id,
          created_at,
          updated_at,
          slug,
          source_url,
          needs_photos,
          categories!category_id ( id, name, slug ),
          product_images ( object_key, position )
        `, { count: 'exact' });

      // Search by name or SKU
      if (qParam.trim()) {
        const text = qParam.trim();
        query = query.or(`name.ilike.%${text}%,sku.ilike.%${text}%`);
      }

      // Filter by category slug
      if (categoryParam) {
        const matchedCat = categories.find((c) => c.slug === categoryParam);
        if (matchedCat) {
          query = query.eq('category_id', matchedCat.id);
        }
      }

      // Filter by tag
      if (tagParam) {
        const { data: taggedProductIds } = await supabase
          .from('product_tags')
          .select('product_id')
          .eq('tag_id', tagParam);

        if (taggedProductIds && taggedProductIds.length > 0) {
          const ids = taggedProductIds.map((tp) => tp.product_id);
          query = query.in('id', ids);
        } else {
          // No product matched tag
          setProducts([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      // Filter by needs_photos
      if (needsPhotosParam) {
        query = query.eq('needs_photos', true);
      }

      // Pagination
      const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error: queryError } = await query
        .order('sku', { ascending: true })
        .range(from, to);

      if (queryError) {
        throw queryError;
      }

      // Format response products
      const formatted: Product[] = (data || []).map((p: any) => {
        // find position 0 image or first image
        let primaryImg: string | null = null;
        if (p.product_images && p.product_images.length > 0) {
          const sorted = [...p.product_images].sort((a: any, b: any) => a.position - b.position);
          primaryImg = sorted[0].object_key;
        }

        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          price_vnd: p.price_vnd,
          price_text: p.price_text,
          description: p.description,
          notes: p.notes,
          category_id: p.category_id,
          brand_id: p.brand_id,
          created_at: p.created_at,
          updated_at: p.updated_at,
          slug: p.slug,
          source_url: p.source_url,
          needs_photos: p.needs_photos,
          category: p.categories ? {
            id: p.categories.id,
            name: p.categories.name,
            slug: p.categories.slug,
            parent_id: null,
          } : null,
          primary_image: primaryImg,
        };
      });

      setProducts(formatted);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Lỗi tải sản phẩm:', err);
      setError(err.message || 'Không thể tải danh sách sản phẩm');
    } finally {
      setLoading(false);
    }
  }, [qParam, categoryParam, tagParam, needsPhotosParam, pageParam, categories]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Handlers for URL parameter changes
  const handleCategoryChange = (slug: string) => {
    const params = new URLSearchParams(searchParams);
    if (slug) {
      params.set('category', slug);
    } else {
      params.delete('category');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleTagChange = (tagId: string) => {
    const params = new URLSearchParams(searchParams);
    if (tagId) {
      params.set('tag', tagId);
    } else {
      params.delete('tag');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleToggleNeedsPhotos = () => {
    const params = new URLSearchParams(searchParams);
    if (!needsPhotosParam) {
      params.set('needs_photos', 'true');
    } else {
      params.delete('needs_photos');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSearchParams({});
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const hasActiveFilters = Boolean(qParam || categoryParam || tagParam || needsPhotosParam);

  return (
    <div className="product-list-page">
      {/* Top Header */}
      <header className="site-header">
        <div className="header-content">
          <div className="logo-badge">TIỀN GIẤY KHO</div>
          <div className="user-section">
            <button
              onClick={handleExportCsv}
              disabled={isExporting}
              className="btn-export-csv"
              title="Xuất toàn bộ danh sách sản phẩm và hình ảnh ra 2 file CSV"
            >
              {isExporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
              <span>{isExporting ? (exportStatus || 'Đang xuất...') : 'Xuất CSV'}</span>
            </button>
            <Link to="/them" className="btn-add-product" title="Thêm sản phẩm mới">
              <Plus size={16} />
              <span>Thêm mới</span>
            </Link>
            <span className="user-email hidden-mobile">{user?.email}</span>
            <button onClick={() => signOut()} className="logout-btn" title="Đăng xuất">
              <LogOut size={16} />
              <span className="hidden-mobile">Thoát</span>
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Export CSV notification toast/banner */}
        {exportNotification && (
          <div
            className={`export-notification-banner ${
              exportNotification.type === 'success' ? 'success' : 'error'
            }`}
          >
            <div className="flex items-center gap-2">
              {exportNotification.type === 'success' ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-red-600 shrink-0" />
              )}
              <span>{exportNotification.message}</span>
            </div>
            <button
              onClick={() => setExportNotification(null)}
              className="banner-close-btn"
              title="Đóng thông báo"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {/* Real Statistics Banner */}
        <section className="stats-strip">
          <div className="stat-pill">
            <Package size={18} className="stat-pill-icon" />
            <span>Tổng kho: <strong>{totalInventory !== null ? totalInventory : '...'}</strong> sản phẩm</span>
          </div>
          <div
            className={`stat-pill clickable ${needsPhotosParam ? 'active' : ''}`}
            onClick={handleToggleNeedsPhotos}
            title="Bấm để lọc sản phẩm cần chụp thêm ảnh"
          >
            <Camera size={18} className="stat-pill-icon" />
            <span>Cần chụp thêm ảnh: <strong>{totalNeedsPhotos !== null ? totalNeedsPhotos : '...'}</strong></span>
          </div>
          <div className="stat-pill">
            <Layers size={18} className="stat-pill-icon" />
            <span>Danh mục: <strong>{categories.length}</strong></span>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <section className="filter-toolbar">
          <div className="toolbar-row">
            {/* Search Input */}
            <div className="search-bar">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mã SKU (VD: TG-00001, 1 Dong...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="clear-search-btn"
                  title="Xóa tìm kiếm"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Needs Photos Quick Toggle */}
            <button
              onClick={handleToggleNeedsPhotos}
              className={`filter-toggle-btn ${needsPhotosParam ? 'active' : ''}`}
            >
              <Camera size={18} />
              <span>Cần chụp thêm ảnh</span>
              {needsPhotosParam && <span className="toggle-badge">BẬT</span>}
            </button>
          </div>

          <div className="toolbar-row select-row">
            {/* Category Dropdown */}
            <div className="select-wrapper">
              <Filter size={16} className="select-icon" />
              <select
                value={categoryParam}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                <option value="">Tất cả danh mục ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag Dropdown (if tags exist) */}
            {tags.length > 0 && (
              <div className="select-wrapper">
                <select
                  value={tagParam}
                  onChange={(e) => handleTagChange(e.target.value)}
                >
                  <option value="">Tất cả thẻ Tag</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hasActiveFilters && (
              <button onClick={clearFilters} className="reset-filters-btn">
                <RefreshCw size={14} />
                <span>Đặt lại bộ lọc</span>
              </button>
            )}
          </div>
        </section>

        {/* Active Filter Tags */}
        <section className="results-summary">
          <span>
            Tìm thấy <strong>{totalCount}</strong> sản phẩm
            {hasActiveFilters && ' (đang áp dụng bộ lọc)'}
          </span>
          <span className="page-indicator">
            Trang {pageParam || 1} / {totalPages}
          </span>
        </section>

        {/* Error Notification */}
        {error && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button onClick={fetchProducts} className="retry-btn">
              Thử lại
            </button>
          </div>
        )}

        {/* Product Grid / Loading State */}
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Đang tải danh sách sản phẩm...</p>
          </div>
        ) : products.length > 0 ? (
          <>
            <div className="product-grid">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            <Pagination
              currentPage={isNaN(pageParam) || pageParam < 1 ? 1 : pageParam}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        ) : (
          <div className="empty-state">
            <Package size={48} className="empty-icon" />
            <h3>Không tìm thấy sản phẩm nào</h3>
            <p>Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các tiêu chí lọc.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="btn-empty-reset">
                Xóa toàn bộ bộ lọc
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

