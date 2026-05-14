import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

export default function MyOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false });
        if (error) {
          showToast('Ошибка загрузки заказов: ' + error.message, 'error');
        }
        setOrders(data || []);
      }
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string; bg: string }> = {
      pending: { label: 'Ожидает назначения', color: '#f59e0b', icon: '⏳', bg: 'rgba(245, 158, 11, 0.1)' },
      accepted: { label: 'Принят курьером', color: '#3b82f6', icon: '✅', bg: 'rgba(59, 130, 246, 0.1)' },
      picked_up: { label: 'Забран со склада', color: '#8b5cf6', icon: '📦', bg: 'rgba(139, 92, 246, 0.1)' },
      in_transit: { label: 'В пути к вам', color: '#10b981', icon: '🚗', bg: 'rgba(16, 185, 129, 0.1)' },
      waiting_client_confirmation: { label: 'Ожидает подтверждения', color: '#ec4899', icon: '📝', bg: 'rgba(236, 72, 153, 0.1)' },
      delivered: { label: 'Доставлен', color: '#6b7280', icon: '🏠', bg: 'rgba(107, 114, 128, 0.1)' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', icon: '📋', bg: 'rgba(107, 114, 128, 0.1)' };
  };

  const getPriceColor = (price: number) => {
    if (price >= 10000) return '#10b981';
    if (price >= 5000) return '#f59e0b';
    return '#ef4444';
  };

  const bgStyle = {
    minHeight: '100vh',
    background: theme === 'dark'
      ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)'
      : 'linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%)',
    padding: '2rem 1rem',
    transition: 'background 0.3s ease',
  };

  const cardStyle = {
    background: theme === 'dark'
      ? 'rgba(30, 41, 59, 0.9)'
      : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(10px)',
    borderRadius: '1.5rem',
    padding: '1.5rem',
    boxShadow: theme === 'dark'
      ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
    transition: 'all 0.3s ease',
    textDecoration: 'none',
    display: 'block',
    cursor: 'pointer',
  };

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'transform 0.2s',
  };

  if (loading) {
    return (
      <div style={bgStyle}>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '3rem' }}>🌀</span>
          <p style={{ marginTop: '1rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            Загрузка заказов...
          </p>
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter(o => o.status !== 'delivered');
  const completedOrders = orders.filter(o => o.status === 'delivered');
  const totalSpent = orders.reduce((sum, o) => sum + (o.price || 0), 0);

  return (
    <div style={bgStyle}>
      {/* Toast уведомление */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '9999px',
          fontSize: '0.9rem',
          fontWeight: 500,
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          animation: 'fadeInDown 0.3s ease-out',
        }}>
          {toast.message}
        </div>
      )}

      {/* Кнопка темы */}
      <button
        onClick={toggleTheme}
        style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          background: theme === 'dark' ? '#334155' : 'white',
          border: 'none',
          borderRadius: '3rem',
          width: '3rem',
          height: '3rem',
          fontSize: '1.5rem',
          cursor: 'pointer',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          transition: 'transform 0.2s',
          zIndex: 50,
        }}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Заголовок */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '4rem',
            height: '4rem',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            borderRadius: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem auto',
            fontSize: '2rem',
          }}>
            📋
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Мои заказы
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            История и статусы ваших заказов
          </p>
        </div>

        {/* Статистика */}
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Всего заказов</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5' }}>{orders.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Активных</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>{activeOrders.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Завершённых</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>{completedOrders.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>💰 Потрачено</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{totalSpent.toLocaleString()} ₸</div>
            </div>
          </div>
        </div>

        {/* Кнопка нового заказа */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Link to="/" style={buttonStyle}>
            ➕ Создать новый заказ
          </Link>
        </div>

        {/* Список заказов */}
        {orders.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
            <h3 style={{ marginBottom: '0.5rem', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
              У вас пока нет заказов
            </h3>
            <p style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', marginBottom: '1.5rem' }}>
              Создайте первый заказ, чтобы начать
            </p>
            <Link to="/" style={buttonStyle}>
              ➕ Создать заказ
            </Link>
          </div>
        )}

        {orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Активные заказы */}
            {activeOrders.length > 0 && (
              <>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
                  🔄 Активные заказы ({activeOrders.length})
                </h3>
                {activeOrders.map((order, index) => {
                  const statusInfo = getStatusInfo(order.status);
                  return (
                    <Link
                      to={`/track/${order.id}`}
                      key={order.id}
                      style={{
                        ...cardStyle,
                        background: statusInfo.bg,
                        animation: 'fadeInUp 0.3s ease-out',
                        animationDelay: `${index * 0.05}s`,
                        animationFillMode: 'both',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>{statusInfo.icon}</span>
                          <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                            Заказ #{order.id.slice(0, 8)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{
                            background: statusInfo.color,
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                          }}>
                            {statusInfo.label}
                          </span>
                          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                            {new Date(order.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                          <span>📍</span>
                          <span><strong>Откуда:</strong> {order.from_address}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                          <span>🎯</span>
                          <span><strong>Куда:</strong> {order.to_address}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                          <span>⚖️ Вес: {order.weight_kg} кг</span>
                          {order.fragile && <span>💔 Хрупкий</span>}
                        </div>
                        <div style={{ fontWeight: 700, color: getPriceColor(order.price) }}>
                          {order.price?.toLocaleString()} ₸
                        </div>
                      </div>

                      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        👆 Нажмите для детального отслеживания →
                      </div>
                    </Link>
                  );
                })}
              </>
            )}

            {/* Завершённые заказы */}
            {completedOrders.length > 0 && (
              <>
                <h3 style={{ margin: '1rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
                  ✅ Завершённые заказы ({completedOrders.length})
                </h3>
                {completedOrders.map((order, index) => {
                  const statusInfo = getStatusInfo(order.status);
                  return (
                    <Link
                      to={`/track/${order.id}`}
                      key={order.id}
                      style={{
                        ...cardStyle,
                        opacity: 0.8,
                        animation: 'fadeInUp 0.3s ease-out',
                        animationDelay: `${index * 0.03}s`,
                        animationFillMode: 'both',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>🏁</span>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            Заказ #{order.id.slice(0, 8)}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                          {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.85rem', flex: 1 }}>
                          {order.from_address} → {order.to_address}
                        </div>
                        <div style={{ fontWeight: 600, color: '#10b981', fontSize: '0.9rem' }}>
                          {order.price?.toLocaleString()} ₸
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Анимации */}
      <style>{`
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}