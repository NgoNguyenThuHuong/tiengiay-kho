import React from 'react';
import { WifiOff, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const OfflinePage: React.FC = () => {
  const navigate = useNavigate();

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 md:p-8 text-center shadow-lg">
        <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center text-[var(--orange)]">
          <WifiOff className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-[var(--brown)] mb-2">
          Không có kết nối mạng
        </h1>

        <p className="text-stone-600 text-sm mb-6 leading-relaxed">
          Thiết bị của bạn hiện đang offline hoặc kết nối Internet bị gián đoạn.
          Dữ liệu trực tuyến tạm thời không thể tải. Vui lòng kiểm tra lại kết nối Wi-Fi hoặc 4G/5G.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleRetry}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--orange)] text-white font-medium hover:bg-amber-600 active:scale-[0.98] transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Thử tải lại trang
          </button>

          <button
            onClick={() => navigate(-1)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-[var(--border)] text-stone-700 bg-white hover:bg-stone-50 transition-all text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại trang trước
          </button>
        </div>

        <div className="mt-8 pt-4 border-t border-[var(--border)] text-xs text-stone-500">
          Tiền Giấy Kho &bull; Hệ thống quản lý tiền giấy cổ
        </div>
      </div>
    </div>
  );
};

