import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-amber-600 text-white text-xs md:text-sm px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-md">
      <div className="flex items-center gap-2 font-medium">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Bạn đang mất kết nối mạng. Các tính năng cập nhật dữ liệu sẽ tạm dừng.</span>
      </div>
      <Link
        to="/offline"
        className="underline text-amber-100 hover:text-white shrink-0 ml-2 font-medium"
      >
        Xem chi tiết
      </Link>
    </div>
  );
};
