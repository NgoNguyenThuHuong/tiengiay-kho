import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

const WORKER_URL = import.meta.env.VITE_UPLOAD_WORKER_URL || '';

export interface CompressionResult {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  previewUrl: string;
}

/**
 * Nén ảnh bằng browser-image-compression về WebP:
 * - maxSizeMB: 3MB
 * - maxWidthOrHeight: 1280px (cạnh dài tối đa)
 * - fileType: 'image/webp'
 * - initialQuality: 0.8
 */
export async function compressImageToWebP(file: File): Promise<CompressionResult> {
  const options = {
    maxSizeMB: 3,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  };

  const originalSize = file.size;
  const compressed = await imageCompression(file, options);
  const previewUrl = URL.createObjectURL(compressed);

  return {
    compressedFile: compressed,
    originalSize,
    compressedSize: compressed.size,
    previewUrl,
  };
}

/**
 * Upload ảnh trực tiếp lên Cloudflare Worker với Supabase JWT
 */
export async function uploadImageViaWorker(
  file: File,
  slug: string
): Promise<{ object_key: string }> {
  if (!WORKER_URL) {
    throw new Error('VITE_UPLOAD_WORKER_URL chưa được cấu hình');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }

  const response = await fetch(`${WORKER_URL}/upload?slug=${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/webp',
    },
    body: file,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Upload thất bại: HTTP ${response.status}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Xóa ảnh trên R2 qua Cloudflare Worker nếu quá trình tạo sản phẩm gặp sự cố
 */
export async function deleteImageViaWorker(objectKey: string): Promise<void> {
  if (!WORKER_URL) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return;

  await fetch(`${WORKER_URL}/object?key=${encodeURIComponent(objectKey)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch((err) => console.error('Lỗi dọn ảnh mồ côi:', err));
}

/**
 * Chuyển đổi tên tiếng Việt thành slug chuẩn url (không dấu, [a-z0-9-])
 */
export function generateSlug(name: string): string {
  let str = name.toLowerCase().trim();
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/[đĐ]/g, 'd');
  str = str.replace(/[^a-z0-9\s-]/g, '');
  str = str.replace(/[\s-]+/g, '-');
  str = str.replace(/^-+|-+$/g, '');
  return str.slice(0, 100) || `sp-${Date.now()}`;
}

