import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  compressImageToWebP,
  uploadImageViaWorker,
  type CompressionResult,
} from '../lib/upload';
import type { ProductImage, Category, Tag } from '../types';
import {
  ArrowLeft,
  Save,
  ArrowUp,
  ArrowDown,
  Star,
  Plus,
  Loader2,
  AlertCircle,
  Layers,
  Tag as TagIcon,
  DollarSign,
  FileText,
  Camera,
  Upload,
  Trash2,
} from 'lucide-react';

const R2_PUBLIC_BASE_URL = import.meta.env.VITE_R2_PUBLIC_BASE_URL || '';

export const ProductEditPage: React.FC = () => {
  const { sku } = useParams<{ sku: string }>();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Original product data
  const [productId, setProductId] = useState<string>('');
  const [originalSku, setOriginalSku] = useState<string>('');
  const [productSlug, setProductSlug] = useState<string>('');

  // Form fields
  const [formSku, setFormSku] = useState('');
  const [name, setName] = useState('');
  const [priceVnd, setPriceVnd] = useState<string>('');
  const [priceText, setPriceText] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [needsPhotos, setNeedsPhotos] = useState<boolean>(false);

  // Categories & Tags
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');

  // Images state
  const [images, setImages] = useState<ProductImage[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!sku) return;
      setLoading(true);
      setErrorMsg(null);

      try {
        const [catRes, tagRes] = await Promise.all([
          supabase.from('categories').select('id, name, slug, parent_id').order('name'),
          supabase.from('tags').select('id, name').order('name'),
        ]);

        if (catRes.data) setAllCategories(catRes.data);
        if (tagRes.data) setAllTags(tagRes.data);

        const { data: prod, error: prodErr } = await supabase
          .from('products')
          .select('*')
          .ilike('sku', sku)
          .single();

        if (prodErr || !prod) {
          throw new Error('Không tìm thấy sản phẩm');
        }

        setProductId(prod.id);
        setOriginalSku(prod.sku);
        setProductSlug(prod.slug || prod.sku.toLowerCase());
        setFormSku(prod.sku);
        setName(prod.name);
        setPriceVnd(prod.price_vnd !== null && prod.price_vnd !== undefined ? String(prod.price_vnd) : '');
        setPriceText(prod.price_text || '');
        setDescription(prod.description || '');
        setNotes(prod.notes || '');
        setCategoryId(prod.category_id || '');
        setNeedsPhotos(Boolean(prod.needs_photos));

        const { data: imgData } = await supabase
          .from('product_images')
          .select('*')
          .eq('product_id', prod.id)
          .order('position', { ascending: true });

        setImages(imgData || []);

        const { data: ptData } = await supabase
          .from('product_tags')
          .select('tag_id')
          .eq('product_id', prod.id);

        if (ptData) {
          setSelectedTagIds(ptData.map((pt) => pt.tag_id));
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Lỗi khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sku]);

  // Upload thêm ảnh mới trực tiếp vào sản phẩm đang sửa
  const handleAddNewImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';

    setUploadProgress(`Đang nén và tải lên ${files.length} ảnh mới...`);

    try {
      const currentHighestPos = images.length > 0 ? Math.max(...images.map((img) => img.position)) : -1;
      let nextPos = currentHighestPos + 1;
      const newUploadedRows: ProductImage[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Đang nén ảnh ${i + 1}/${files.length}...`);
        const compressed: CompressionResult = await compressImageToWebP(file);

        setUploadProgress(`Đang upload ảnh ${i + 1}/${files.length} qua Worker...`);
        const res = await uploadImageViaWorker(compressed.compressedFile, productSlug);

        // Lưu bản ghi vào database
        const { data: insertedImg, error: imgErr } = await supabase
          .from('product_images')
          .insert({
            product_id: productId,
            object_key: res.object_key,
            position: nextPos,
          })
          .select()
          .single();

        if (imgErr) throw imgErr;
        if (insertedImg) {
          newUploadedRows.push(insertedImg);
          nextPos++;
        }
      }

      const combined = [...images, ...newUploadedRows];
      setImages(combined);

      // Tự động tắt needs_photos nếu đã có từ 2 ảnh trở lên
      if (combined.length >= 2 && needsPhotos) {
        setNeedsPhotos(false);
        await supabase.from('products').update({ needs_photos: false }).eq('id', productId);
      }
    } catch (err: any) {
      console.error('Lỗi khi thêm ảnh mới:', err);
      setErrorMsg(`Upload ảnh thất bại: ${err.message}`);
    } finally {
      setUploadProgress(null);
    }
  };

  // Image reordering
  const moveImage = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const withPositions = updated.map((img, idx) => ({
      ...img,
      position: idx,
    }));
    setImages(withPositions);
  };

  const makePrimary = (index: number) => {
    if (index === 0) return;
    const updated = [...images];
    const [selected] = updated.splice(index, 1);
    updated.unshift(selected);

    const withPositions = updated.map((img, idx) => ({
      ...img,
      position: idx,
    }));
    setImages(withPositions);
  };

  const deleteExistingImage = async (imgId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa ảnh này khỏi sản phẩm?')) return;
    try {
      await supabase.from('product_images').delete().eq('id', imgId);
      const remaining = images
        .filter((img) => img.id !== imgId)
        .map((img, idx) => ({ ...img, position: idx }));
      setImages(remaining);

      // Cập nhật lại needs_photos nếu dưới 2 ảnh
      if (remaining.length < 2 && !needsPhotos) {
        setNeedsPhotos(true);
      }
    } catch (err: any) {
      alert('Không thể xóa ảnh: ' + err.message);
    }
  };

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

    try {
      const { data: newTag, error: tagErr } = await supabase
        .from('tags')
        .insert({ name: trimmed })
        .select()
        .single();

      if (tagErr) throw tagErr;
      if (newTag) {
        setAllTags([...allTags, newTag]);
        setSelectedTagIds([...selectedTagIds, newTag.id]);
        setNewTagName('');
      }
    } catch (err: any) {
      alert('Không thể tạo thẻ mới: ' + (err.message || 'Lỗi không xác định'));
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanSku = formSku.trim();
    const cleanName = name.trim();

    if (!cleanSku) {
      setErrorMsg('Mã SKU không được để trống');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Tên sản phẩm không được để trống');
      return;
    }

    setSaving(true);

    try {
      if (cleanSku !== originalSku) {
        const { data: skuCheck } = await supabase
          .from('products')
          .select('id')
          .ilike('sku', cleanSku)
          .neq('id', productId)
          .maybeSingle();

        if (skuCheck) {
          throw new Error(`Mã SKU "${cleanSku}" đã tồn tại trên hệ thống. Vui lòng chọn mã khác.`);
        }
      }

      let parsedPriceVnd: number | null = null;
      if (priceVnd.trim()) {
        const numeric = parseInt(priceVnd.replace(/\D/g, ''), 10);
        if (isNaN(numeric) || numeric < 0) {
          throw new Error('Giá tiền VND phải là số nguyên dương hợp lệ');
        }
        parsedPriceVnd = numeric;
      }

      const { error: updateErr } = await supabase
        .from('products')
        .update({
          sku: cleanSku,
          name: cleanName,
          price_vnd: parsedPriceVnd,
          price_text: priceText.trim() || (parsedPriceVnd === null ? 'Liên hệ' : null),
          description: description.trim() || null,
          notes: notes.trim() || null,
          category_id: categoryId || null,
          needs_photos: needsPhotos,
          updated_at: new Date().toISOString(),
        })
        .eq('id', productId);

      if (updateErr) throw updateErr;

      // Cập nhật thứ tự vị trí ảnh
      for (const img of images) {
        await supabase
          .from('product_images')
          .update({ position: img.position })
          .eq('id', img.id);
      }

      // Cập nhật Tags
      await supabase.from('product_tags').delete().eq('product_id', productId);
      if (selectedTagIds.length > 0) {
        const tagRows = selectedTagIds.map((tid) => ({
          product_id: productId,
          tag_id: tid,
        }));
        await supabase.from('product_tags').insert(tagRows);
      }

      navigate(`/san-pham/${encodeURIComponent(cleanSku)}`, { replace: true });
    } catch (err: any) {
      console.error('Lỗi khi lưu:', err);
      setErrorMsg(err.message || 'Lỗi khi cập nhật sản phẩm');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-loading-wrap">
        <div className="spinner"></div>
        <p>Đang tải thông tin chỉnh sửa...</p>
      </div>
    );
  }

  return (
    <div className="product-edit-page">
      <header className="site-header">
        <div className="header-content">
          <Link to={`/san-pham/${originalSku}`} className="back-link">
            <ArrowLeft size={18} />
            <span>Chi tiết</span>
          </Link>
          <span className="detail-header-sku">Sửa: {originalSku}</span>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-action-save"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Lưu thay đổi</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="main-content">
        {errorMsg && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>{errorMsg}</span>
          </div>
        )}

        {uploadProgress && (
          <div className="progress-banner">
            <Loader2 size={18} className="animate-spin" />
            <span>{uploadProgress}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="edit-form-grid">
          {/* Cột 1: Thông tin cơ bản */}
          <div className="form-column main-fields">
            <div className="form-card">
              <h2>Thông tin cơ bản</h2>

              <div className="form-group">
                <label>Mã SKU *</label>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="TG-00001"
                  className="input-text monospace"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tên sản phẩm *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập tên sản phẩm..."
                  className="input-text"
                  required
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label><DollarSign size={14} /> Giá VND (số)</label>
                  <input
                    type="text"
                    value={priceVnd}
                    onChange={(e) => setPriceVnd(e.target.value)}
                    placeholder="VD: 600000 (để trống nếu Liên hệ)"
                    className="input-text"
                  />
                  <small className="form-hint">Để trống số nếu muốn hiển thị "Liên hệ"</small>
                </div>

                <div className="form-group">
                  <label>Chữ hiển thị giá</label>
                  <input
                    type="text"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    placeholder="VD: Liên hệ, 600.000đ"
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
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={needsPhotos}
                    onChange={(e) => setNeedsPhotos(e.target.checked)}
                  />
                  <span>Đánh dấu: <strong>Cần chụp thêm ảnh</strong> (needs_photos)</span>
                </label>
              </div>

              <div className="form-group">
                <label><FileText size={14} /> Mô tả sản phẩm</label>
                <textarea
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả chi tiết sản phẩm..."
                  className="textarea-input"
                />
              </div>

              <div className="form-group">
                <label>Ghi chú nội bộ</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú vị trí khay, hộp đựng..."
                  className="textarea-input"
                />
              </div>
            </div>
          </div>

          {/* Cột 2: Ảnh & Thẻ Tag */}
          <div className="form-column side-fields">
            {/* Ảnh sản phẩm card */}
            <div className="form-card">
              <h2>Ảnh sản phẩm ({images.length})</h2>

              {/* Nút thêm ảnh vào sản phẩm đang sửa */}
              <div className="upload-buttons-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*"
                  onChange={handleAddNewImages}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-upload-action library"
                >
                  <Upload size={16} />
                  <span>Thêm ảnh từ thư viện</span>
                </button>

                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleAddNewImages}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="btn-upload-action camera"
                >
                  <Camera size={16} />
                  <span>Chụp thêm</span>
                </button>
              </div>

              <p className="card-sub-info">
                Ảnh đầu tiên (Vị trí 1) là ảnh đại diện. Bấm sao để đổi đại diện.
              </p>

              {images.length === 0 ? (
                <p className="desc-empty">Chưa có ảnh nào.</p>
              ) : (
                <div className="edit-images-list">
                  {images.map((img, idx) => (
                    <div key={img.id} className={`edit-image-item ${idx === 0 ? 'is-primary' : ''}`}>
                      <span className="image-index-badge">{idx + 1}</span>
                      <img
                        src={`${R2_PUBLIC_BASE_URL}/${img.object_key}`}
                        alt={`Ảnh ${idx + 1}`}
                        className="edit-image-thumb"
                      />
                      <div className="edit-image-info">
                        <span className="object-key-text">{img.object_key.split('/').pop()}</span>
                        {idx === 0 && <span className="primary-pill">Đại diện</span>}
                      </div>

                      <div className="edit-image-controls">
                        <button
                          type="button"
                          onClick={() => moveImage(idx, 'up')}
                          disabled={idx === 0}
                          className="btn-order"
                          title="Lên trên"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(idx, 'down')}
                          disabled={idx === images.length - 1}
                          className="btn-order"
                          title="Xuống dưới"
                        >
                          <ArrowDown size={15} />
                        </button>
                        {idx !== 0 && (
                          <button
                            type="button"
                            onClick={() => makePrimary(idx)}
                            className="btn-order primary"
                            title="Đặt làm ảnh đại diện"
                          >
                            <Star size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteExistingImage(img.id)}
                          className="btn-order delete"
                          title="Xóa ảnh"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tags card */}
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
                <button
                  type="button"
                  onClick={handleAddNewTag}
                  className="btn-add-tag"
                >
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
