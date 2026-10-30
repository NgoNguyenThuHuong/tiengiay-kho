import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        setErrorMsg('Email hoặc mật khẩu không chính xác');
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setErrorMsg('Đã xảy ra lỗi kết nối, vui lòng thử lại');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-badge">TIỀN GIẤY</div>
          <h2>Quản Lý Kho tiengiay-kho</h2>
          <p className="subtitle">Hệ thống nội bộ - Vui lòng đăng nhập</p>
        </div>

        {errorMsg && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                id="email"
                type="email"
                placeholder="admin@tiengiay.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Mật khẩu</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        <div className="login-footer">
          <small>Hệ thống không hỗ trợ đăng ký tài khoản tự do.</small>
        </div>
      </div>
    </div>
  );
};

