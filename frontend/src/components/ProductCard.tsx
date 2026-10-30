import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { ImageOff, Camera } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

const R2_PUBLIC_BASE_URL = import.meta.env.VITE_R2_PUBLIC_BASE_URL || '';

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [imgError, setImgError] = useState(false);

  const imageUrl = product.primary_image && !imgError
    ? `${R2_PUBLIC_BASE_URL}/${product.primary_image}`
    : null;

  const formatPrice = (priceVnd: number | null, priceText: string | null) => {
    if (priceVnd !== null && priceVnd !== undefined) {
      return `${priceVnd.toLocaleString('vi-VN')}đ`;
    }
    return priceText || 'Liên hệ';
  };

  return (
    <Link to={`/san-pham/${encodeURIComponent(product.sku)}`} className={`product-card ${product.needs_photos ? 'needs-photos-card' : ''}`}>
      <div className="card-thumb-wrapper">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            className="card-thumb-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="card-thumb-placeholder">
            <ImageOff size={28} className="placeholder-icon" />
            <span>Chưa có ảnh</span>
          </div>
        )}

        {product.needs_photos && (
          <span className="badge-needs-photos" title="Cần chụp thêm ảnh">
            <Camera size={13} />
            <span>Cần ảnh</span>
          </span>
        )}
      </div>

      <div className="card-details">
        <div className="card-sku-row">
          <span className="card-sku">{product.sku}</span>
          {product.category?.name && (
            <span className="card-category-tag">{product.category.name}</span>
          )}
        </div>
        <h3 className="card-title" title={product.name}>
          {product.name}
        </h3>
        <div className="card-price">
          {formatPrice(product.price_vnd, product.price_text)}
        </div>
      </div>
    </Link>
  );
};
