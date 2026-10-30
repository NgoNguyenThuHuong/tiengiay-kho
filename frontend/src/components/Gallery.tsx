import React, { useState } from 'react';
import type { ProductImage } from '../types';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

interface GalleryProps {
  images: ProductImage[];
  title: string;
}

const R2_PUBLIC_BASE_URL = import.meta.env.VITE_R2_PUBLIC_BASE_URL || '';

export const Gallery: React.FC<GalleryProps> = ({ images, title }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  if (!images || images.length === 0) {
    return (
      <div className="gallery-empty">
        <ImageOff size={48} className="gallery-empty-icon" />
        <p>Sản phẩm này chưa có ảnh trong kho</p>
      </div>
    );
  }

  const currentImage = images[selectedIndex] || images[0];
  const currentUrl = `${R2_PUBLIC_BASE_URL}/${currentImage.object_key}`;

  const handlePrev = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  // Touch swipe support on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <div className="gallery-container">
      {/* Main big image */}
      <div
        className="gallery-main"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={currentUrl}
          alt={`${title} - ảnh ${selectedIndex + 1}`}
          className="gallery-main-img"
        />

        {images.length > 1 && (
          <>
            <button onClick={handlePrev} className="gallery-nav-btn prev" title="Ảnh trước">
              <ChevronLeft size={24} />
            </button>
            <button onClick={handleNext} className="gallery-nav-btn next" title="Ảnh sau">
              <ChevronRight size={24} />
            </button>
            <div className="gallery-indicator">
              {selectedIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails row */}
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((img, idx) => (
            <button
              key={img.id || idx}
              onClick={() => setSelectedIndex(idx)}
              className={`gallery-thumb-btn ${selectedIndex === idx ? 'active' : ''}`}
            >
              <img
                src={`${R2_PUBLIC_BASE_URL}/${img.object_key}`}
                alt={`Thumb ${idx + 1}`}
                className="gallery-thumb-img"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

