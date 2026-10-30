import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Gallery } from '../components/Gallery';
import type { Product, ProductImage, Tag } from '../types';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Camera,
  Calendar,
  ExternalLink,
  Tag as TagIcon,
  Layers,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

export const ProductDetailPage: React.FC = () => {
  const { sku } = useParams<{ sku: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmSku, setConfirmSku] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!sku) return;
      setLoading(true);
      setError(null);

      try {
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select(`
            *,
            categories!category_id ( id, name, slug )
          `)
          .ilike('sku', sku)
          .single();

        if (prodErr || !prodData) {
          throw new Error('Không tìm thấy sản phẩm này');
        }

        // Fetch images ordered by position
        const { data: imgData } = await supabase
          .from('product_images')
          .select('*')
          .eq('product_id', prodData.id)
          .order('position', { ascending: true });

        // Fetch tags
        const { data: tagData } = await supabase
          .from('product_tags')
          .select('tags ( id, name )')
          .eq('product_id', prodData.id);

        const fetchedTags: Tag[] = (tagData || [])
          .map((item: any) => item.tags)
          .filter(Boolean);

        setProduct({
          ...prodData,
          category: prodData.categories ? {
            id: prodData.categories.id,
            name: prodData.categories.name,
            slug: prodData.categories.slug,
            parent_id: null,
          } : null,
        });
        setImages(imgData || []);
        setTags(fetchedTags);
      } catch (err: any) {
        setError(err.message || 'Lỗi khi tải thông tin sản phẩm');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [sku]);

  const handleDelete = async () => {
    if (!product) return;
    if (confirmSku.trim() !== product.sku) {
      setDeleteError(`Vui lòng nhập chính xác mã SKU: ${product.sku}`);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // 1. Log orphan R2 object keys to console as instructed
      const orphanKeys = images.map((img) => img.object_key);
      console.warn(
        `[QUẢN LÝ KHO] XÓA SẢN PHẨM SKU=${product.sku}. Các ảnh R2 mồ côi (chưa xóa file vật lý trên R2 cho đến khi có Cloudflare Worker):`,
        orphanKeys
      );

      // 2. Delete product_images rows in Supabase
      await supabase.from('product_images').delete().eq('product_id', product.id);

      // 3. Delete product_tags rows
      await supabase.from('product_tags').delete().eq('product_id', product.id);

      // 4. Delete product row
      const { error: delErr } = await supabase.from('products').delete().eq('id', product.id);
      if (delErr) throw delErr;

      // 5. Navigate back to list
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Lỗi khi xóa:', err);
      setDeleteError(err.message || 'Không thể xóa sản phẩm. Vui lòng thử lại.');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-loading-wrap">
        <div className="spinner"></div>
        <p>Đang tải thông tin sản phẩm...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="main-content">
        <div className="detail-error-box">
          <AlertTriangle size={32} />
          <h2>{error || 'Sản phẩm không tồn tại'}</h2>
          <Link to="/" className="btn-back">
            <ArrowLeft size={16} /> Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const formatPrice = (priceVnd: number | null, priceText: string | null) => {
    if (priceVnd !== null && priceVnd !== undefined) {
      return `${priceVnd.toLocaleString('vi-VN')}đ`;
    }
    return priceText || 'Liên hệ';
  };

  return (
    <div className="product-detail-page">
      {/* Top Header Bar */}
      <header className="site-header">
        <div className="header-content">
          <Link to="/" className="back-link">
            <ArrowLeft size={18} />
            <span>Danh sách</span>
          </Link>
          <span className="detail-header-sku">{product.sku}</span>
          <div className="header-actions">
            <Link to={`/san-pham/${product.sku}/sua`} className="btn-action-edit">
              <Edit3 size={15} />
              <span>Sửa</span>
            </Link>
            <button onClick={() => setShowDeleteModal(true)} className="btn-action-delete">
              <Trash2 size={15} />
              <span>Xóa</span>
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="detail-grid">
          {/* Left Column: Gallery */}
          <div className="detail-left">
            <Gallery images={images} title={product.name} />

            {product.needs_photos && (
              <div className="needs-photos-banner">
                <Camera size={20} />
                <div>
                  <strong>Sản phẩm này cần chụp thêm ảnh!</strong>
                  <p>Số lượng ảnh hiện tại: {images.length} (Kỳ vọng từ 2 ảnh trở lên).</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Full Info */}
          <div className="detail-right">
            <div className="detail-card">
              <div className="detail-meta-top">
                <span className="sku-tag">{product.sku}</span>
                {product.category && (
                  <span className="category-tag">
                    <Layers size={13} />
                    {product.category.name}
                  </span>
                )}
              </div>

              <h1 className="detail-title">{product.name}</h1>

              <div className="detail-price-box">
                <span className="price-label">Giá bán:</span>
                <span className="price-value">
                  {formatPrice(product.price_vnd, product.price_text)}
                </span>
              </div>

              {/* Tags list */}
              {tags.length > 0 && (
                <div className="detail-tags-section">
                  <span className="tags-label"><TagIcon size={14} /> Thẻ:</span>
                  <div className="tags-badges">
                    {tags.map((t) => (
                      <span key={t.id} className="tag-badge">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="detail-desc-box">
                <h3>Mô tả sản phẩm</h3>
                {product.description ? (
                  <div className="desc-content">{product.description}</div>
                ) : (
                  <p className="desc-empty">Chưa có thông tin mô tả chi tiết.</p>
                )}
              </div>

              {/* Internal Notes */}
              {product.notes && (
                <div className="detail-notes-box">
                  <h3>Ghi chú nội bộ</h3>
                  <p>{product.notes}</p>
                </div>
              )}

              {/* Meta timestamps and source */}
              <div className="detail-timestamps">
                {product.source_url && (
                  <a
                    href={product.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                  >
                    <ExternalLink size={14} />
                    <span>Xem bài gốc trên tiengiay.vn</span>
                  </a>
                )}
                <div className="time-row">
                  <Calendar size={13} />
                  <span>Cập nhật lần cuối: {new Date(product.updated_at).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-icon-wrap delete">
              <AlertTriangle size={32} />
            </div>
            <h2>Xác nhận xóa sản phẩm</h2>
            <p>
              Hành động này sẽ xóa hoàn toàn sản phẩm <strong>"{product.name}"</strong> khỏi cơ sở dữ liệu Supabase.
            </p>
            <p className="modal-instruction">
              Để xác nhận, vui lòng nhập lại chính xác mã SKU: <code>{product.sku}</code>
            </p>

            <input
              type="text"
              placeholder={`Nhập ${product.sku} vào đây`}
              value={confirmSku}
              onChange={(e) => setConfirmSku(e.target.value)}
              className="modal-sku-input"
              autoFocus
            />

            {deleteError && <div className="modal-error-msg">{deleteError}</div>}

            <div className="modal-actions">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmSku('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="btn-modal-cancel"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || confirmSku.trim() !== product.sku}
                className="btn-modal-confirm-delete"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Xác nhận xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

