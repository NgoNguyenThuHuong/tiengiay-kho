import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { ProductListPage } from './pages/ProductListPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductEditPage } from './pages/ProductEditPage';
import { ProductCreatePage } from './pages/ProductCreatePage';
import { OfflinePage } from './pages/OfflinePage';
import { OfflineBanner } from './components/OfflineBanner';
import './index.css';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OfflineBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ProductListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/them"
            element={
              <ProtectedRoute>
                <ProductCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/san-pham/:sku"
            element={
              <ProtectedRoute>
                <ProductDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/san-pham/:sku/sua"
            element={
              <ProtectedRoute>
                <ProductEditPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
