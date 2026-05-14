import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import VideoCall from '../../components/VideoCall';
import LowStockAlert from '../../components/LowStockAlert';
import { useTheme } from '../../context/ThemeContext';

interface Order {
  id: string;
  from_address: string;
  to_address: string;
  weight_kg: number;
  price: number;
  status: string;
  courier_id?: string;
  requires_large_vehicle?: boolean;
}

interface Courier {
  id: string;
  full_name: string;
}

interface Collector {
  id: string;
  full_name: string;
}

// Жёстко задаём ключи (временно, для обхода ошибки ImportMeta)
const SUPABASE_URL = 'https://uchithtrlvtawritbxrh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjaGl0aHRybHZ0YXdyaXRieHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODM2NzYsImV4cCI6MjA5MTE1OTY3Nn0.60QUNH2WH8X3fGqe3bBhAQgWZHQaMpoASXrj9LHL110';

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [callUserName, setCallUserName] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (ordersError) showToast('Ошибка загрузки заказов: ' + ordersError.message, 'error');
    if (ordersData) setOrders(ordersData);

    const { data: couriersData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'courier');
    if (couriersData) setCouriers(couriersData);

    const { data: collectorsData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'collector');
    if (collectorsData) setCollectors(collectorsData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const assignCourier = async (orderId: string, courierId: string) => {
    if (!courierId) return;
    setLoading(true);
    const { error } = await supabase
      .from('orders')
      .update({ courier_id: courierId, status: 'accepted' })
      .eq('id', orderId);
    if (error) {
      showToast('Ошибка: ' + error.message, 'error');
    } else {
      showToast('✅ Курьер назначен успешно!', 'success');
      await loadData();
    }
    setLoading(false);
  };

  const assignCollector = async (orderId: string, collectorId: string) => {
    if (!collectorId) return;
    setLoading(true);
    const { data: existing } = await supabase
      .from('picking_tasks')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();
    if (existing) {
      showToast('Для этого заказа уже создано задание сборщику', 'error');
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from('picking_tasks')
      .insert({ order_id: orderId, collector_id: collectorId, status: 'pending' });
    if (error) {
      showToast('Ошибка: ' + error.message, 'error');
    } else {
      showToast('✅ Сборщик назначен. Задание создано!', 'success');
      await loadData();
    }
    setLoading(false);
  };

  const aiAssign = async (orderId: string, type: 'courier' | 'collector') => {
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/autoAssign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'autoAssign', orderId, orderType: type }),
      });
      const data = await response.json();
      if (data.success) {
        showToast(`🤖 AI назначил ${type === 'courier' ? 'курьера' : 'сборщика'}!`, 'success');
        await loadData();
      } else {
        showToast('Ошибка AI: ' + (data.error || 'Не удалось назначить'), 'error');
      }
    } catch (err) {
      showToast('Ошибка соединения с AI-функцией', 'error');
    }
    setLoading(false);
  };

  const startCall = (roomSuffix: string, userName: string) => {
    setCallRoom(`order-${roomSuffix}`);
    setCallUserName(userName);
    setShowCall(true);
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string; bg: string }> = {
      pending: { label: 'В ожидании', color: '#d97706', icon: '⏳', bg: 'rgba(245, 158, 11, 0.1)' },
      accepted: { label: 'Принят', color: '#3b82f6', icon: '✅', bg: 'rgba(59, 130, 246, 0.1)' },
      picked_up: { label: 'Забран', color: '#8b5cf6', icon: '📦', bg: 'rgba(139, 92, 246, 0.1)' },
      in_transit: { label: 'В пути', color: '#10b981', icon: '🚚', bg: 'rgba(16, 185, 129, 0.1)' },
      delivered: { label: 'Доставлен', color: '#6b7280', icon: '🏁', bg: 'rgba(107, 114, 128, 0.1)' },
      ready_for_delivery: { label: 'Готов к доставке', color: '#f59e0b', icon: '📋', bg: 'rgba(245, 158, 11, 0.1)' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', icon: '📋', bg: 'rgba(107, 114, 128, 0.1)' };
  };

  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(order => order.status === statusFilter);

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
    marginBottom: '1rem',
    boxShadow: theme === 'dark'
      ? '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
      : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
    transition: 'all 0.3s ease',
  };

  const selectStyle = {
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    cursor: 'pointer',
  };

  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '0.75rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'transform 0.2s',
  };

  return (
    <div style={bgStyle}>
      <LowStockAlert />
      
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

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
            📊
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Панель диспетчера
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Управление заказами, курьерами и сборщиками
          </p>
        </div>

        {/* Панель управления */}
        <div style={{ ...cardStyle, marginBottom: '2rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={loadData}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: 'white',
                }}
              >
                {loading ? '⏳ Загрузка...' : '🔄 Обновить'}
              </button>
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">🎯 Все статусы</option>
              <option value="pending">⏳ В ожидании</option>
              <option value="accepted">✅ Принят</option>
              <option value="picked_up">📦 Забран</option>
              <option value="in_transit">🚚 В пути</option>
              <option value="ready_for_delivery">📋 Готов к доставке</option>
              <option value="delivered">🏁 Доставлен</option>
            </select>
          </div>
        </div>

        {/* Статистика */}
        <div style={{ ...cardStyle, marginBottom: '2rem', padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5' }}>{orders.length}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Всего заказов</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>{orders.filter(o => o.status === 'pending').length}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>В ожидании</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>{orders.filter(o => o.status === 'in_transit').length}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>В пути</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#8b5cf6' }}>{couriers.length}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Курьеров</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ec4899' }}>{collectors.length}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Сборщиков</div>
            </div>
          </div>
        </div>

        {/* Заказы */}
        {loading && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '2rem' }}>🌀</span>
            <p>Загрузка заказов...</p>
          </div>
        )}

        {filteredOrders.length === 0 && !loading && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            {statusFilter !== 'all' ? '📭 Нет заказов с выбранным статусом' : '📭 Нет активных заказов'}
          </div>
        )}

        {filteredOrders.map((order, index) => {
          const statusInfo = getStatusInfo(order.status);
          return (
            <div
              key={order.id}
              style={{
                ...cardStyle,
                background: statusInfo.bg,
                animation: 'fadeInUp 0.3s ease-out',
                animationDelay: `${index * 0.03}s`,
                animationFillMode: 'both',
              }}
            >
              {/* Заголовок заказа */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📦 Заказ #{order.id.slice(0, 8)}</span>
                    <span style={{
                      background: statusInfo.color,
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}>
                      {statusInfo.icon} {statusInfo.label}
                    </span>
                    {order.requires_large_vehicle && (
                      <span style={{
                        background: '#ef4444',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                      }}>
                        🚛 Большегруз
                      </span>
                    )}
                  </h3>
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  💰 {order.price.toLocaleString()} ₸
                </div>
              </div>

              {/* Адреса */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span>📍</span>
                  <span><strong>Откуда:</strong> {order.from_address}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🎯</span>
                  <span><strong>Куда:</strong> {order.to_address}</span>
                </div>
              </div>

              {/* Вес */}
              <div style={{ marginBottom: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
                ⚖️ Вес: {order.weight_kg} кг
              </div>

              {/* Действия */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Назначение курьера */}
                {order.courier_id ? (
                  <>
                    <span style={{ fontSize: '0.9rem', color: '#10b981' }}>✅ Курьер назначен: {order.courier_id.slice(0, 8)}</span>
                    <button
                      onClick={() => startCall(`${order.id}-courier`, 'Диспетчер')}
                      style={{
                        ...buttonStyle,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white',
                      }}
                    >
                      📞 Позвонить курьеру
                    </button>
                    <button
                      onClick={() => startCall(`${order.id}-client`, 'Диспетчер')}
                      style={{
                        ...buttonStyle,
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        color: 'white',
                      }}
                    >
                      📞 Позвонить клиенту
                    </button>
                  </>
                ) : (
                  <>
                    <select
                      onChange={(e) => assignCourier(order.id, e.target.value)}
                      defaultValue=""
                      disabled={loading}
                      style={selectStyle}
                    >
                      <option value="" disabled>Назначить курьера</option>
                      {couriers.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                    </select>
                    <button
                      onClick={() => aiAssign(order.id, 'courier')}
                      style={{
                        ...buttonStyle,
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        color: 'white',
                      }}
                      disabled={loading}
                    >
                      🤖 AI Курьер
                    </button>
                  </>
                )}

                {/* Назначение сборщика */}
                {order.status === 'pending' && (
                  <>
                    <select
                      onChange={(e) => assignCollector(order.id, e.target.value)}
                      defaultValue=""
                      disabled={loading}
                      style={selectStyle}
                    >
                      <option value="" disabled>Назначить сборщика</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                    </select>
                    <button
                      onClick={() => aiAssign(order.id, 'collector')}
                      style={{
                        ...buttonStyle,
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        color: 'white',
                      }}
                      disabled={loading}
                    >
                      🤖 AI Сборщик
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Видеозвонок - без пропса theme */}
      {showCall && (
        <VideoCall
          roomName={callRoom}
          userName={callUserName}
          onClose={() => setShowCall(false)}
        />
      )}

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
            transform: translateY(10px);
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