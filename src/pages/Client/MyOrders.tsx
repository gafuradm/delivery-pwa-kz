import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function MyOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('orders').select('*').eq('client_id', user.id).order('created_at', { ascending: false });
        setOrders(data || []);
      }
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    accepted: '✅',
    picked_up: '📦',
    in_transit: '🚗',
    delivered: '🏠'
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <>
      <Link to="/" className="btn-primary" style={{ display: 'inline-block', marginBottom: '1rem' }}>+ Новый заказ</Link>
      {orders.length === 0 && <p>У вас пока нет заказов.</p>}
      {orders.map(order => (
        <Link to={`/track/${order.id}`} key={order.id} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{statusEmoji[order.status]} {order.id.slice(0,8)}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(order.created_at).toLocaleDateString()}</span>
            </div>
            <p>{order.from_address} → {order.to_address}</p>
            <p>Вес: {order.weight_kg} кг | Цена: {order.price} ₸</p>
          </div>
        </Link>
      ))}
    </>
  );
}