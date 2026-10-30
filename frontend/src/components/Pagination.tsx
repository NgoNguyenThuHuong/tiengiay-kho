import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="pagination-wrapper">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="page-nav-btn"
        title="Trang trước"
      >
        <ChevronLeft size={16} />
        <span className="hidden-mobile">Trước</span>
      </button>

      <div className="page-numbers">
        {getPageNumbers().map((page, idx) =>
          typeof page === 'number' ? (
            <button
              key={idx}
              onClick={() => onPageChange(page)}
              className={`page-num-btn ${currentPage === page ? 'active' : ''}`}
            >
              {page}
            </button>
          ) : (
            <span key={idx} className="page-ellipsis">
              {page}
            </span>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="page-nav-btn"
        title="Trang sau"
      >
        <span className="hidden-mobile">Sau</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

