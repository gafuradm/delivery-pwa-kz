import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import VideoCall from '../../components/VideoCall';
import { Link } from 'react-router-dom';

interface Order {
  id: string;
  from_address: string;
  to_address: string;
  weight_kg: number;
  price: number;
  status: string;
  courier_id?: string;
}

interface Courier {
  id: string;
  full_name: string;
}

interface Collector {
  id: string;
  full_name: string;
}

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [callUserName, setCallUserName] = useState('');

  const loadData = async () => {
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
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
      alert('Ошибка: ' + error.message);
    } else {
      alert('Курьер назначен');
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
      alert('Для этого заказа уже создано задание сборщику');
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from('picking_tasks')
      .insert({ order_id: orderId, collector_id: collectorId, status: 'pending' });
    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      alert('Сборщик назначен. Задание создано.');
      await loadData();
    }
    setLoading(false);
  };

  const aiAssign = async (orderId: string, type: 'courier' | 'collector') => {
    setLoading(true);
    try {
      const supabaseUrl = 'https://uchithtrlvtawritbxrh.supabase.co';
      const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjaGl0aHRybHZ0YXdyaXRieHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODM2NzYsImV4cCI6MjA5MTE1OTY3Nn0.60QUNH2WH8X3fGqe3bBhAQgWZHQaMpoASXrj9LHL110';

      const response = await fetch(`${supabaseUrl}/functions/v1/autoAssign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ action: 'autoAssign', orderId, orderType: type }),
      });
      const data = await response.json();
      if (data.success) {
        alert(`AI назначил ${type === 'courier' ? 'курьера' : 'сборщика'}!`);
        await loadData();
      } else {
        alert('Ошибка AI: ' + (data.error || 'Не удалось назначить'));
      }
    } catch (err) {
      alert('Ошибка соединения с AI-функцией');
    }
    setLoading(false);
  };

  const startCall = (roomSuffix: string, userName: string) => {
    setCallRoom(`order-${roomSuffix}`);
    setCallUserName(userName);
    setShowCall(true);
  };

  const statusColor: Record<string, string> = {
    pending: '#fef3c7',
    accepted: '#dbeafe',
    picked_up: '#d1fae5',
    in_transit: '#bfdbfe',
    delivered: '#e5e7eb',
    ready_for_delivery: '#d1fae5'
  };

  return (
    <div className="container">
      <button onClick={loadData} className="btn-secondary" style={{ marginBottom: '1rem' }}>🔄 Обновить</button>
      
      {orders.map(order => (
        <div key={order.id} style={{ background: statusColor[order.status] || 'white', padding: 15, margin: 10, borderRadius: 10, border: '1px solid #ddd' }}>
          <p><strong>Заказ #{order.id.slice(0, 8)}</strong> | Статус: {order.status}</p>
          <p>{order.from_address} → {order.to_address}</p>
          <p>Вес: {order.weight_kg}кг | Цена: {order.price}₸</p>
          
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {/* Назначение курьера */}
            {order.courier_id ? (
              <>
                <p>✅ Курьер назначен: {order.courier_id.slice(0, 8)}</p>
                <button onClick={() => startCall(`${order.id}-courier`, 'Диспетчер')} className="btn-primary" style={{ background: '#6c757d' }}>📞 Позвонить курьеру</button>
                <button onClick={() => startCall(`${order.id}-client`, 'Диспетчер')} className="btn-primary" style={{ background: '#6c757d' }}>📞 Позвонить клиенту</button>
              </>
            ) : (
              <>
                <select onChange={(e) => assignCourier(order.id, e.target.value)} defaultValue="" disabled={loading}>
                  <option value="" disabled>Назначить курьера</option>
                  {couriers.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                </select>
                <button onClick={() => aiAssign(order.id, 'courier')} className="btn-primary" style={{ background: '#8b5cf6' }} disabled={loading}>🤖 AI назначить курьера</button>
              </>
            )}

            {/* Назначение сборщика */}
            {order.status === 'pending' && (
              <>
                <select onChange={(e) => assignCollector(order.id, e.target.value)} defaultValue="" disabled={loading}>
                  <option value="" disabled>Назначить сборщика</option>
                  {collectors.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                </select>
                <button onClick={() => aiAssign(order.id, 'collector')} className="btn-primary" style={{ background: '#8b5cf6' }} disabled={loading}>🤖 AI назначить сборщика</button>
              </>
            )}
          </div>
        </div>
      ))}
      
      {showCall && (
        <VideoCall
          roomName={callRoom}
          userName={callUserName}
          onClose={() => setShowCall(false)}
        />
      )}
    </div>
  );
}