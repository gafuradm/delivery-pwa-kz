import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import VideoCall from '../../components/VideoCall';
import LowStockAlert from '../../components/LowStockAlert';

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
  const [notifying, setNotifying] = useState(false);
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
  /*
  const checkStockAndNotify = async () => {
    setNotifying(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/checkStockAndNotify`, {
        method: 'POST',
        
      });
      const data = await response.json();
      if (data.success) {
        alert(`Уведомления отправлены (${data.sent} диспетчерам)`);
      } else {
        alert('Ошибка: ' + (data.error || 'Не удалось отправить уведомления'));
      }
    } catch (err) {
      alert('Ошибка соединения с функцией уведомлений');
    }
    setNotifying(false);
  };*/

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
    <>
      <LowStockAlert />
      
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={loadData} className="btn-secondary">🔄 Обновить</button>
        
      </div>
      
      {orders.map(order => (
        <div key={order.id} className="card" style={{ background: statusColor[order.status] || 'white', marginBottom: '1rem' }}>
          <p><strong>Заказ #{order.id.slice(0, 8)}</strong> | Статус: {order.status}
            {order.requires_large_vehicle && <span style={{ color: 'var(--warning)', marginLeft: 10 }}>⚠️ Требуется большегрузная машина</span>}
          </p>
          <p>{order.from_address} → {order.to_address}</p>
          <p>Вес: {order.weight_kg}кг | Цена: {order.price}₸</p>
          
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {/* Назначение курьера */}
            {order.courier_id ? (
              <>
                <p>✅ Курьер назначен: {order.courier_id.slice(0, 8)}</p>
                <button onClick={() => startCall(`${order.id}-courier`, 'Диспетчер')} className="btn-secondary">📞 Позвонить курьеру</button>
                <button onClick={() => startCall(`${order.id}-client`, 'Диспетчер')} className="btn-secondary">📞 Позвонить клиенту</button>
              </>
            ) : (
              <>
                <select onChange={(e) => assignCourier(order.id, e.target.value)} defaultValue="" disabled={loading} className="btn-secondary">
                  <option value="" disabled>Назначить курьера</option>
                  {couriers.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                </select>
                <button onClick={() => aiAssign(order.id, 'courier')} className="btn-primary" style={{ background: '#8b5cf6' }} disabled={loading}>🤖 AI</button>
              </>
            )}

            {/* Назначение сборщика */}
            {order.status === 'pending' && (
              <>
                <select onChange={(e) => assignCollector(order.id, e.target.value)} defaultValue="" disabled={loading} className="btn-secondary">
                  <option value="" disabled>Назначить сборщика</option>
                  {collectors.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                </select>
                <button onClick={() => aiAssign(order.id, 'collector')} className="btn-primary" style={{ background: '#8b5cf6' }} disabled={loading}>🤖 AI</button>
              </>
            )}
          </div>
        </div>
      ))}
      {orders.length === 0 && <p>Нет заказов</p>}
      
      {showCall && (
        <VideoCall
          roomName={callRoom}
          userName={callUserName}
          onClose={() => setShowCall(false)}
        />
      )}
    </>
  );
}