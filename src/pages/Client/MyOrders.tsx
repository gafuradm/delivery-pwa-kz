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
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false });
        setOrders(data || []);
      }
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    accepted: '✅',
    picked_up: '��',
    in_transit: '🚗',
    delivered: '🏠'
  };

  if (loading) return <div className="container">Загрузка...</div>;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Мои заказы</h1>
        <div>
          <Link to="/profile" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>👤 Профиль</Link>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')} className="btn-primary" style={{ background: '#dc2626' }}>Выйти</button>
        </div>
      </div>
      <Link to="/" className="btn-primary" style={{ display: 'inline-block', marginBottom: 20 }}>+ Новый заказ</Link>
      {orders.length === 0 && <p>У вас пока нет заказов.</p>}
      {orders.map(order => (
        <Link to={`/track/${order.id}`} key={order.id} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ background: 'white', padding: 15, margin: '10px 0', borderRadius: 10, border: '1px solid #ddd', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 'bold' }}>{statusEmoji[order.status]} {order.id.slice(0,8)}</span>
              <span style={{ fontSize: 14, color: '#666' }}>{new Date(order.created_at).toLocaleDateString()}</span>
            </div>
            <p>{order.from_address} → {order.to_address}</p>
            <p>Вес: {order.weight_kg} кг | Цена: {order.price} ₸</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
