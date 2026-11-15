import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Files,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  X,
} from 'lucide-react';
import Logo from './Logo';
import Avatar from './Avatar';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';

const NAV = [
  { to: '/app', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/app/files', label: 'Mes fichiers', icon: Files },
  { to: '/app/verify', label: 'Vérification', icon: ShieldCheck },
  { to: '/app/certificates', label: 'Certificats', icon: BadgeCheck },
  { to: '/app/audit', label: 'Journal d’audit', icon: ScrollText },
  { to: '/app/security', label: 'Tests de sécurité', icon: ShieldCheck },
];

export default function AppLayout() {
  const { user, logout, keyUnlocked } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    toast.info('Déconnecté', 'Votre session a été révoquée côté serveur.');
    navigate('/');
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <Logo />
          <button type="button" className="icon-btn sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <nav className="nav">
          <span className="nav__label">Espace sécurisé</span>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav__item ${isActive ? 'nav__item--active' : ''}`}
            >
              <Icon size={17} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className={`vault-state ${keyUnlocked ? '' : 'vault-state--locked'}`}>
            <span className="vault-state__pulse" />
            <div>
              <strong>{keyUnlocked ? 'Clé privée déverrouillée' : 'Clé privée verrouillée'}</strong>
              <span>{keyUnlocked ? 'Conservée en mémoire le temps de la session' : 'Reconnectez-vous pour signer'}</span>
            </div>
          </div>
          <div className="user-card">
            <Avatar name={user?.username} size="sm" />
            <div className="user-card__text">
              <strong>{user?.username}</strong>
              <span>{user?.email}</span>
            </div>
            <button type="button" className="icon-btn" onClick={handleLogout} aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {menuOpen ? <button type="button" className="sidebar__scrim" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" /> : null}

      <div className="shell__main">
        <header className="mobilebar">
          <button type="button" className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <Logo size={24} />
          <Avatar name={user?.username} size="sm" />
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
