import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  compressImageToWebP,
  uploadImageViaWorker,
  deleteImageViaWorker,
  generateSlug,
  type CompressionResult,
} from '../lib/upload';
import type { Category, Tag } from '../types';
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Upload,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  Layers,
  Tag as TagIcon,
  DollarSign,
  FileText,
} from 'lucide-react';

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  uploadStatus: 'idle' | 'compressing' | 'uploading' | 'done' | 'error';
  uploadedKey?: string;
  errorMessage?: string;
}

export const ProductCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [priceVnd, setPriceVnd] = useState('');
  const [priceText, setPriceText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Categories & Tags
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');

  // Images state
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Auto-generate slug when name changes
  useEffect(() => {
    if (name) {
      setSlug(generateSlug(name));
    }
  }, [name]);

  // Load Categories & Tags
  useEffect(() => {
    const fetchMeta = async () => {
      const [catRes, tagRes] = await Promise.all([
        supabase.from('categories').select('id, name, slug, parent_id').order('name'),
        supabase.from('tags').select('id, name').order('name'),
      ]);
      if (catRes.data) setAllCategories(catRes.data);
      if (tagRes.data) setAllTags(tagRes.data);
    };
    fetchMeta();
  }, []);

  // Handle selected files (multi-file or camera)
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Reset input so same file can be selected again
    e.target.value = '';

    for (const file of files) {
      const tempId = crypto.randomUUID();
      // Add placeholder image
      setImages((prev) => [
        ...prev,
        {
          id: tempId,
          file,
          previewUrl: URL.createObjectURL(file),
          originalSize: file.size,
          compressedSize: 0,
          uploadStatus: 'compressing',
        },
      ]);

      try {
        const compressed: CompressionResult = await compressImageToWebP(file);
        setImages((prev) =>
          prev.map((img) =>
            img.id === tempId
              ? {
                  ...img,
                  file: compressed.compressedFile,
                  previewUrl: compressed.previewUrl,
                  compressedSize: compressed.compressedSize,
                  uploadStatus: 'idle',
                }
              : img
          )
        );
      } catch (err: any) {
        console.error('Lỗi nén ảnh:', err);
        setImages((prev) =>
          prev.map((img) =>
            img.id === tempId
              ? {
                  ...img,
                  uploadStatus: 'error',
                  errorMessage: 'Lỗi nén ảnh',
                }
              : img
          )
        );
      }
    }
  };

  // Reorder images
  const moveImage = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= images.length) return;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setImages(updated);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Format bytes
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Tag helper
  const handleAddNewTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const existing = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) {
        setSelectedTagIds([...selectedTagIds, existing.id]);
      }
      setNewTagName('');
      return;
    }
    const { data: newTag } = await supabase.from('tags').insert({ name: trimmed }).select().single();
    if (newTag) {
      setAllTags([...allTags, newTag]);
      setSelectedTagIds([...selectedTagIds, newTag.id]);
      setNewTagName('');
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  // Submit and Upload flow
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Tên sản phẩm không được để trống');
      return;
    }

    const currentSlug = slug || generateSlug(cleanName);

    // Parse price
    let parsedPriceVnd: number | null = null;
    if (priceVnd.trim()) {
      const numeric = parseInt(priceVnd.replace(/\D/g, ''), 10);
      if (isNaN(numeric) || numeric < 0) {
        setFormError('Giá tiền VND không hợp lệ');
        return;
      }
      parsedPriceVnd = numeric;
    }

    setIsSubmitting(true);
    const uploadedKeysToCleanup: string[] = [];

    try {
      // 1. Kiểm tra SKU nếu người dùng tự nhập tay
      let finalSku = sku.trim();
      if (finalSku) {
        const { data: skuExists } = await supabase
          .from('products')
          .select('id')
          .ilike('sku', finalSku)
          .maybeSingle();

        if (skuExists) {
          throw new Error(`Mã SKU "${finalSku}" đã tồn tại. Vui lòng chọn mã khác hoặc để trống.`);
        }
      }

      // 2. Upload ảnh tuần tự qua Cloudflare Worker (tối đa 2 ảnh cùng lúc hoặc tuần tự)
      const uploadedImageResults: { objectKey: string; position: number }[] = [];
      const totalImages = images.length;

      for (let i = 0; i < totalImages; i++) {
        const currentImg = images[i];
        setUploadProgress(`Đang upload ảnh ${i + 1}/${totalImages}...`);

        setImages((prev) =>
          prev.map((img) => (img.id === currentImg.id ? { ...img, uploadStatus: 'uploading' } : img))
        );

        try {
          const res = await uploadImageViaWorker(currentImg.file, currentSlug);
          uploadedKeysToCleanup.push(res.object_key);
          uploadedImageResults.push({ objectKey: res.object_key, position: i });

          setImages((prev) =>
            prev.map((img) =>
              img.id === currentImg.id
                ? { ...img, uploadStatus: 'done', uploadedKey: res.object_key }
                : img
            )
          );
        } catch (uploadErr: any) {
          setImages((prev) =>
            prev.map((img) =>
              img.id === currentImg.id
                ? { ...img, uploadStatus: 'error', errorMessage: uploadErr.message }
                : img
            )
          );
          throw new Error(`Upload ảnh "${currentImg.file.name}" thất bại: ${uploadErr.message}`);
        }
      }

      setUploadProgress('Đang lưu thông tin sản phẩm vào cơ sở dữ liệu...');

      // 3. Tự động xác định needs_photos: nếu >= 2 ảnh thì false, ngược lại true
      const autoNeedsPhotos = uploadedImageResults.length < 2;

      // 4. Tạo sản phẩm trong Supabase
      const productPayload: any = {
        name: cleanName,
        slug: currentSlug,
        price_vnd: parsedPriceVnd,
        price_text: priceText.trim() || (parsedPriceVnd === null ? 'Liên hệ' : null),
        category_id: categoryId || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        needs_photos: autoNeedsPhotos,
      };

      if (finalSku) {
        productPayload.sku = finalSku;
      }

      const { data: newProd, error: prodErr } = await supabase
        .from('products')
        .insert(productPayload)
        .select()
        .single();

      if (prodErr) throw prodErr;

      // 5. Ghi các dòng product_images vào Supabase
      if (uploadedImageResults.length > 0) {
        const imageRows = uploadedImageResults.map((item) => ({
          product_id: newProd.id,
          object_key: item.objectKey,
          position: item.position,
        }));
        const { error: imgErr } = await supabase.from('product_images').insert(imageRows);
        if (imgErr) throw imgErr;
      }

      // 6. Ghi product_tags
      if (selectedTagIds.length > 0) {
        const tagRows = selectedTagIds.map((tid) => ({
          product_id: newProd.id,
          tag_id: tid,
        }));
        await supabase.from('product_tags').insert(tagRows);
      }

      // Hoàn thành: chuyển thẳng về trang chi tiết sản phẩm mới
      navigate(`/san-pham/${encodeURIComponent(newProd.sku)}`, { replace: true });
    } catch (err: any) {
      console.error('Lỗi khi thêm sản phẩm:', err);
      setFormError(err.message || 'Lỗi không xác định khi tạo sản phẩm');

      // Tự động dọn dẹp các ảnh đã upload nếu quá trình tạo sản phẩm bị lỗi giữa chừng
      if (uploadedKeysToCleanup.length > 0) {
        console.warn('Đang dọn dẹp các ảnh vừa upload do quá trình tạo sản phẩm gặp lỗi...');
        for (const k of uploadedKeysToCleanup) {
          deleteImageViaWorker(k);
        }
      }
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="product-create-page">
      <header className="site-header">
        <div className="header-content">
          <Link to="/" className="back-link">
            <ArrowLeft size={18} />
            <span>Kho</span>
          </Link>
          <span className="detail-header-sku">Thêm Sản Phẩm Mới</span>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-action-save"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Upload size={16} />
                <span>Tạo sản phẩm</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="main-content">
        {formError && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>{formError}</span>
          </div>
        )}

        {uploadProgress && (
          <div className="progress-banner">
            <Loader2 size={18} className="animate-spin" />
            <span>{uploadProgress}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="edit-form-grid">
          {/* Cột 1: Thông tin sản phẩm */}
          <div className="form-column main-fields">
            <div className="form-card">
              <h2>Thông tin cơ bản</h2>

              <div className="form-group">
                <label>Tên sản phẩm *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: 5 Đồng 1955 - Cây dừa..."
                  className="input-text"
                  required
                  autoFocus
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Mã SKU (tùy chọn)</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Để trống tự sinh (TG-xxxxx)"
                    className="input-text monospace"
                  />
                  <small className="form-hint">Để trống sẽ dùng số kế tiếp: TG-00736...</small>
                </div>

                <div className="form-group">
                  <label>Đường dẫn tĩnh (Slug)</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="tu-dong-sinh-ra"
                    className="input-text monospace"
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label><DollarSign size={14} /> Giá VND (số)</label>
                  <input
                    type="text"
                    value={priceVnd}
                    onChange={(e) => setPriceVnd(e.target.value)}
                    placeholder="VD: 150000"
                    className="input-text"
                  />
                </div>

                <div className="form-group">
                  <label>Chữ hiển thị giá</label>
                  <input
                    type="text"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    placeholder="VD: Liên hệ, 150.000đ"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="form-group">
                <label><Layers size={14} /> Danh mục</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="select-input"
                >
                  <option value="">-- Chọn danh mục --</option>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label><FileText size={14} /> Mô tả sản phẩm</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Thông tin chất lượng, tình trạng tiền giấy, lịch sử phát hành..."
                  className="textarea-input"
                />
              </div>

              <div className="form-group">
                <label>Ghi chú nội bộ</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Vị trí khay đựng, người gửi..."
                  className="textarea-input"
                />
              </div>
            </div>
          </div>

          {/* Cột 2: Chọn / Chụp ảnh & Tags */}
          <div className="form-column side-fields">
            {/* Ảnh sản phẩm card */}
            <div className="form-card">
              <h2>
                <ImageIcon size={18} />
                <span>Ảnh sản phẩm ({images.length})</span>
              </h2>

              {/* Nút chụp ảnh và chọn thư viện - Tối ưu cho điện thoại */}
              <div className="upload-buttons-row">
                {/* Input chọn nhiều ảnh từ thư viện */}
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*"
                  onChange={handleFilesSelected}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-upload-action library"
                >
                  <Upload size={18} />
                  <span>Chọn từ thư viện</span>
                </button>

                {/* Input chụp ảnh camera trực tiếp từ điện thoại */}
                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleFilesSelected}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="btn-upload-action camera"
                >
                  <Camera size={18} />
                  <span>Chụp trực tiếp</span>
                </button>
              </div>

              <p className="card-sub-info">
                Tự động nén về WebP (tối đa 1280px, chất lượng 0.8). Cần từ 2 ảnh trở lên để không bị đánh dấu "Cần ảnh".
              </p>

              {/* Danh sách ảnh đã chọn */}
              <div className="pending-images-list">
                {images.length === 0 ? (
                  <div className="pending-empty">
                    <Camera size={36} className="empty-cam-icon" />
                    <span>Chưa có ảnh nào được chọn</span>
                  </div>
                ) : (
                  images.map((img, idx) => (
                    <div key={img.id} className="pending-image-item">
                      <span className="image-index-badge">{idx + 1}</span>
                      <img src={img.previewUrl} alt={`Ảnh ${idx + 1}`} className="pending-thumb" />

                      <div className="pending-meta">
                        <span className="file-name">{img.file.name}</span>
                        <span className="file-size">
                          {formatSize(img.originalSize)} ➔{' '}
                          <strong>{img.compressedSize > 0 ? formatSize(img.compressedSize) : 'Đang nén...'}</strong>
                        </span>
                        {idx === 0 && <span className="primary-pill">Ảnh đại diện</span>}
                        {img.errorMessage && <span className="error-text">{img.errorMessage}</span>}
                      </div>

                      <div className="pending-controls">
                        <button
                          type="button"
                          onClick={() => moveImage(idx, 'up')}
                          disabled={idx === 0}
                          className="btn-order"
                          title="Lên trên"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(idx, 'down')}
                          disabled={idx === images.length - 1}
                          className="btn-order"
                          title="Xuống dưới"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="btn-order delete"
                          title="Xóa ảnh"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Thẻ Tag Card */}
            <div className="form-card">
              <h2><TagIcon size={16} /> Thẻ Tag</h2>

              <div className="add-tag-row">
                <input
                  type="text"
                  placeholder="Thêm tag mới..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewTag();
                    }
                  }}
                  className="input-text new-tag-input"
                />
                <button type="button" onClick={handleAddNewTag} className="btn-add-tag">
                  <Plus size={16} />
                </button>
              </div>

              <div className="tag-checklist">
                {allTags.map((t) => {
                  const isChecked = selectedTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`tag-toggle-item ${isChecked ? 'active' : ''}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};
