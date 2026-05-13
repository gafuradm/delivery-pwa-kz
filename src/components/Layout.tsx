import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../context/ThemeContext';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  role?: 'client' | 'courier' | 'dispatcher' | 'collector' | 'crane_operator';
}

export default function Layout({ children, title, role }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const getNavLinks = () => {
    const links = [];
    if (role === 'client') {
      links.push({ to: '/', label: 'Главная', icon: '🏠' });
      links.push({ to: '/my-orders', label: 'Мои заказы', icon: '📋' });
    } else if (role === 'courier') {
      links.push({ to: '/', label: 'Мои задания', icon: '🚚' });
    } else if (role === 'dispatcher') {
      links.push({ to: '/', label: 'Заказы', icon: '📦' });
      links.push({ to: '/analytics', label: 'Аналитика', icon: '📊' });
      links.push({ to: '/warehouses', label: 'Склады', icon: '🏭' });
      links.push({ to: '/containers', label: 'Контейнеры', icon: '📦' });
    } else if (role === 'collector') {
      links.push({ to: '/', label: 'Задания', icon: '📦' });
    } else if (role === 'crane_operator') {
      links.push({ to: '/', label: 'Размещение контейнеров', icon: '🏗️' });
    }
    links.push({ to: '/profile', label: 'Профиль', icon: '👤' });
    return links;
  };

  const navLinks = getNavLinks();
  const closeMenu = () => setMenuOpen(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(8px)' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Delivery PWA
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={toggleTheme} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '2rem', padding: '0.5rem', cursor: 'pointer', fontSize: '1.2rem' }}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 1rem' }}>
              ☰ <span className="hide-mobile">Меню</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', padding: '0.5rem', minWidth: '200px', zIndex: 101 }}>
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  color: location.pathname === link.to ? 'var(--accent)' : 'var(--text-primary)',
                  textDecoration: 'none',
                  borderRadius: 'var(--radius)',
                  transition: 'var(--transition)',
                  fontWeight: location.pathname === link.to ? 'bold' : 'normal',
                }}
              >
                {link.icon} {link.label}
              </Link>
            ))}
            <button onClick={handleLogout} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.75rem 1rem', color: 'var(--danger)', cursor: 'pointer', borderRadius: 'var(--radius)', fontSize: '1rem' }}>
              🚪 Выйти
            </button>
          </div>
        )}
      </header>
      <main className="container">
        {title && <h1 style={{ marginBottom: '1rem', fontSize: '1.8rem' }}>{title}</h1>}
        {children}
      </main>
      <style>{`
        @media (max-width: 480px) {
          .hide-mobile { display: none; }
        }
      `}</style>
    </div>
  );
}