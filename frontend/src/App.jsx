import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import AppLayout from './components/AppLayout';
import Logo from './components/Logo';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import Verify from './pages/Verify';
import Certificates from './pages/Certificates';
import Audit from './pages/Audit';
import Security from './pages/Security';

function BootScreen() {
  return (
    <div className="boot">
      <Logo size={38} />
      <p>Chargement…</p>
    </div>
  );
}

function Protected({ children }) {
  const { user, booted } = useAuth();
  if (!booted) return <BootScreen />;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, booted } = useAuth();
  if (!booted) return <BootScreen />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route
              path="/"
              element={
                <GuestOnly>
                  <Auth />
                </GuestOnly>
              }
            />
            <Route
              path="/app"
              element={
                <Protected>
                  <AppLayout />
                </Protected>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="files" element={<Files />} />
              <Route path="verify" element={<Verify />} />
              <Route path="certificates" element={<Certificates />} />
              <Route path="audit" element={<Audit />} />
              <Route path="security" element={<Security />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
