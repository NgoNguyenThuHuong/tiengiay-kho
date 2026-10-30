import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Package, Image as ImageIcon, Database } from 'lucide-react';

export const DashboardPlaceholder: React.FC = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="dashboard-container">
      <header className="site-header">
        <div className="header-content">
          <div className="logo-badge">TIỀN GIẤY KHO</div>
          <div className="user-section">
            <span className="user-email">{user?.email}</span>
            <button onClick={() => signOut()} className="logout-btn" title="Đăng xuất">
              <LogOut size={16} />
              <span>Thoát</span>
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="welcome-banner">
          <h1>Chào mừng đến Hệ Thống Kho Tiền Giấy!</h1>
          <p>Giai đoạn 1 (Xác thực đăng nhập & Route bảo vệ) đã hoàn tất thành công.</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><Package size={28} /></div>
            <div className="stat-info">
              <h3>735</h3>
              <p>Sản phẩm trong kho</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><ImageIcon size={28} /></div>
            <div className="stat-info">
              <h3>1.558</h3>
              <p>Ảnh trên Cloudflare R2</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Database size={28} /></div>
            <div className="stat-info">
              <h3>Supabase</h3>
              <p>Database sẵn sàng (RLS Auth)</p>
            </div>
          </div>
        </div>

        <div className="next-steps-card">
          <h2>Sẵn sàng cho Giai đoạn 2:</h2>
          <ul>
            <li>Hiển thị danh sách sản phẩm phân trang 24 sản phẩm.</li>
            <li>Ảnh thu nhỏ R2, tên, mã SKU, giá bán.</li>
            <li>Bộ tìm kiếm theo tên, SKU, lọc theo danh mục.</li>
            <li>Bộ lọc quan trọng: <strong>"Cần chụp thêm ảnh" (needs_photos)</strong>.</li>
          </ul>
        </div>
      </main>
    </div>
  );
};

