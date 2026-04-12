import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { getRouteDistance } from '../../lib/yandexMaps';
import DeliveryConfirmationModal from '../../components/DeliveryConfirmationModal';
import Receipt from '../../components/Receipt';
import VideoCall from '../../components/VideoCall';
import { cacheOrder, getCachedOrders, addOfflineAction, getOfflineActions, clearOfflineActions } from '../../lib/db';
import VoiceAssistant from '../../components/VoiceAssistant';
import LanguageSwitcher from '../../components/LanguageSwitcher';

interface Order {
  id: string;
  from_address: string;
  to_address: string;
  from_coords: string;
  to_coords: string;
  weight_kg: number;
  fragile: boolean;
  status: string;
  delivery_code: string;
  price?: number;
  photo_url?: string;
  signature_url?: string;
}

interface Point {
  id: string;
  orderId: string;
  type: 'pickup' | 'delivery';
  address: string;
  lat: number;
  lng: number;
}

export default function Tasks() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedSequence, setOptimizedSequence] = useState<Point[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [deliveredOrder, setDeliveredOrder] = useState<any>(null);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [callUserName, setCallUserName] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [profile, setProfile] = useState<{ rating: number }>({ rating: 5 });
  const [voiceLang, setVoiceLang] = useState<'ru' | 'kk'>('ru');

  // Загрузка профиля (рейтинг)
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('rating').eq('id', user.id).single();
        if (data) setProfile(data);
      }
    };
    fetchProfile();
  }, []);

  const loadOrders = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (isOnline) {
      const { data: fresh } = await supabase
        .from('orders')
        .select('*')
        .eq('courier_id', user.id)
        .order('created_at', { ascending: false });
      if (fresh) {
        setOrders(fresh);
        for (const order of fresh) await cacheOrder(order);
      }
    } else {
      const cached = await getCachedOrders({ courierId: user.id });
      setOrders(cached);
    }
  };

  // Синхронизация офлайн-действий
  useEffect(() => {
    const syncOfflineActions = async () => {
      const actions = await getOfflineActions();
      for (const action of actions) {
        if (action.action === 'updateStatus') {
          const { orderId, newStatus } = action.data;
          await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
          await supabase.from('order_events').insert({ order_id: orderId, status: newStatus, message: `Статус изменён на ${newStatus}` });
          await cacheOrder({ ...orders.find(o => o.id === orderId), status: newStatus });
        }
      }
      await clearOfflineActions();
      loadOrders();
    };
    if (isOnline) syncOfflineActions();
  }, [isOnline]);

  // Слушаем изменения сети
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadOrders();
    const channel = supabase
      .channel('my-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isOnline]);

  // Геолокация
  useEffect(() => {
    const startGeo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (!navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          await supabase.from('courier_locations').upsert({
            courier_id: user.id,
            lat: latitude,
            lng: longitude,
            updated_at: new Date().toISOString()
          });
        },
        (err) => console.error('Геолокация ошибка:', err),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      setWatchId(id);
    };
    startGeo();
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, []);

  const parseCoords = (coordStr: string): { lat: number; lng: number } => {
    const match = coordStr.match(/\(([^,]+),([^)]+)\)/);
    if (!match) return { lat: 0, lng: 0 };
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
  };

  const optimizeRoute = async () => {
    if (orders.length === 0) {
      alert('Нет активных заказов');
      return;
    }
    if (!currentLocation) {
      alert('Не удалось определить ваше местоположение. Включите геолокацию.');
      return;
    }
    setOptimizing(true);

    const points: Point[] = [];
    for (const order of orders) {
      const from = parseCoords(order.from_coords);
      const to = parseCoords(order.to_coords);
      points.push({
        id: `${order.id}_pickup`,
        orderId: order.id,
        type: 'pickup',
        address: order.from_address,
        lat: from.lat,
        lng: from.lng
      });
      points.push({
        id: `${order.id}_delivery`,
        orderId: order.id,
        type: 'delivery',
        address: order.to_address,
        lat: to.lat,
        lng: to.lng
      });
    }

    const allPoints = [currentLocation, ...points.map(p => ({ lat: p.lat, lng: p.lng }))];
    const n = allPoints.length;
    const distMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const route = await getRouteDistance(
          [allPoints[i].lat, allPoints[i].lng],
          [allPoints[j].lat, allPoints[j].lng]
        );
        const duration = route?.duration || 0;
        distMatrix[i][j] = duration;
        distMatrix[j][i] = duration;
      }
    }

    const orderIndices = orders.map((_, idx) => idx);
    const permutations = permute(orderIndices);
    let bestTime = Infinity;
    let bestPermutation: number[] = [];

    for (const perm of permutations) {
      let totalTime = 0;
      let prevIdx = 0;
      for (const orderIdx of perm) {
        const pickupIdx = 1 + orderIdx * 2;
        const deliveryIdx = pickupIdx + 1;
        totalTime += distMatrix[prevIdx][pickupIdx];
        totalTime += distMatrix[pickupIdx][deliveryIdx];
        prevIdx = deliveryIdx;
      }
      if (totalTime < bestTime) {
        bestTime = totalTime;
        bestPermutation = perm;
      }
    }

    const sequence: Point[] = [];
    for (const orderIdx of bestPermutation) {
      sequence.push(points[orderIdx * 2]);
      sequence.push(points[orderIdx * 2 + 1]);
    }
    setOptimizedSequence(sequence);
    setOptimizing(false);
    alert(`Маршрут оптимизирован! Общее время: ${Math.round(bestTime / 60)} минут.`);
  };

  const permute = (arr: number[]): number[][] => {
    if (arr.length <= 1) return [arr];
    const result: number[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      const perms = permute(rest);
      for (const perm of perms) {
        result.push([arr[i], ...perm]);
      }
    }
    return result;
  };

  const navigateTo = (address: string) => {
    window.open(`https://yandex.ru/maps/?mode=routes&rtext=${encodeURIComponent(address)}`, '_blank');
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    setLoading(true);
    if (isOnline) {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (!error) {
        await supabase.from('order_events').insert({ order_id: orderId, status: newStatus, message: `Статус изменён на ${newStatus}` });
        await cacheOrder({ ...orders.find(o => o.id === orderId), status: newStatus });
        await loadOrders();
        if (newStatus === 'delivered') setOptimizedSequence(prev => prev.filter(p => p.orderId !== orderId));
      } else {
        alert('Ошибка: ' + error.message);
      }
    } else {
      await addOfflineAction('updateStatus', { orderId, newStatus });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      alert('Действие сохранено. Будет синхронизировано при подключении к интернету.');
    }
    setLoading(false);
  };

  const handleDeliveryConfirm = async (photoUrl: string, signatureUrl: string) => {
    if (!currentOrderId) return;
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'waiting_client_confirmation', 
        photo_url: photoUrl, 
        signature_url: signatureUrl,
        delivered_at: new Date().toISOString()
      })
      .eq('id', currentOrderId);
    if (!error) {
      await supabase.from('order_events').insert({ 
        order_id: currentOrderId, 
        status: 'waiting_client_confirmation', 
        message: 'Доставлен с фото и подписью, ожидает подтверждения клиента' 
      });
      await cacheOrder({ ...orders.find(o => o.id === currentOrderId), status: 'waiting_client_confirmation', photo_url: photoUrl, signature_url: signatureUrl });
      await loadOrders();
    } else {
      alert('Ошибка: ' + error.message);
    }
    setShowDeliveryModal(false);
    setCurrentOrderId(null);
  };

  const startCall = (roomSuffix: string, userName: string) => {
    setCallRoom(`order-${roomSuffix}`);
    setCallUserName(userName);
    setShowCall(true);
  };

  // Обработка голосовых команд
  const handleVoiceCommand = (command: string) => {
    switch (command) {
      case 'profile':
        navigate('/profile');
        break;
      case 'logout':
        supabase.auth.signOut().then(() => navigate('/'));
        break;
      case 'optimize':
        optimizeRoute();
        break;
      case 'refresh':
        loadOrders();
        break;
      case 'accept-order':
        if (orders.length > 0 && orders[0].status === 'pending') updateStatus(orders[0].id, 'accepted');
        else alert('Нет доступных заказов для принятия');
        break;
      case 'picked-up':
        if (orders.length > 0 && orders[0].status === 'accepted') updateStatus(orders[0].id, 'picked_up');
        else alert('Нет заказов в статусе "принят"');
        break;
      case 'in-transit':
        if (orders.length > 0 && orders[0].status === 'picked_up') updateStatus(orders[0].id, 'in_transit');
        else alert('Нет заказов в статусе "забран"');
        break;
      case 'deliver':
        if (orders.length > 0 && orders[0].status === 'in_transit') {
          setCurrentOrderId(orders[0].id);
          setShowDeliveryModal(true);
        } else alert('Нет заказов в пути');
        break;
      case 'navigate-to-warehouse':
        if (orders.length > 0) navigateTo(orders[0].from_address);
        break;
      case 'navigate-to-client':
        if (orders.length > 0) navigateTo(orders[0].to_address);
        break;
      case 'call-client':
        if (orders.length > 0) startCall(`${orders[0].id}-client`, 'Курьер');
        break;
      case 'order-status':
        alert(orders.map(o => `${o.id.slice(0,8)}: ${o.status}`).join('\n') || 'Нет активных заказов');
        break;
      case 'order-count':
        alert(`У вас ${orders.length} активных заказов`);
        break;
      case 'my-rating':
        alert(`Ваш рейтинг: ${profile.rating.toFixed(1)}`);
        break;
      case 'earnings':
        const todayEarnings = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.price || 0), 0);
        alert(`За сегодня вы заработали ${todayEarnings} тенге`);
        break;
      default:
        break;
    }
  };

  const ordersCount = orders.length;
  const rating = profile.rating;
  const todayEarnings = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.price || 0), 0);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Мои задания</h1>
        <div>⭐ Рейтинг: {rating.toFixed(1)}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={loadOrders} className="btn-primary">🔄 Обновить</button>
        <button onClick={optimizeRoute} disabled={optimizing} className="btn-primary" style={{ background: '#10b981' }}>
          {optimizing ? 'Оптимизация...' : '✨ Оптимизировать маршрут'}
        </button>
      </div>
      {!isOnline && <div style={{ background: '#fee2e2', padding: 8, borderRadius: 8, marginBottom: 10 }}>⚠️ Офлайн-режим. Действия будут синхронизированы позже.</div>}

      {optimizedSequence.length > 0 && (
        <div style={{ background: '#e0f2fe', padding: 15, borderRadius: 10, marginBottom: 20 }}>
          <h3>📌 Оптимальный порядок маршрута</h3>
          <ol>
            {optimizedSequence.map((point, idx) => (
              <li key={point.id} style={{ marginBottom: 10 }}>
                {point.type === 'pickup' ? '📦 Забрать со склада:' : '🏠 Доставить клиенту:'}
                <strong> {point.address}</strong>
                <button onClick={() => navigateTo(point.address)} style={{ marginLeft: 10, padding: '4px 8px' }}>🗺️ Проложить маршрут</button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {orders.map(order => (
        <div key={order.id} style={{ background: 'white', padding: 15, margin: 10, borderRadius: 10 }}>
          <p><strong>Заказ #{order.id.slice(0, 8)}</strong></p>
          <p>Откуда: {order.from_address}</p>
          <p>Куда: {order.to_address}</p>
          <p>Вес: {order.weight_kg} кг | Хрупкий: {order.fragile ? 'Да' : 'Нет'}</p>
          <p>Статус: {order.status}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => updateStatus(order.id, 'accepted')} disabled={loading}>✅ Принять</button>
            <button onClick={() => updateStatus(order.id, 'picked_up')} disabled={loading}>📦 Забрал</button>
            <button onClick={() => updateStatus(order.id, 'in_transit')} disabled={loading}>🚗 В пути</button>
            <button onClick={() => { setCurrentOrderId(order.id); setShowDeliveryModal(true); }} disabled={loading}>🏠 Доставить (с фото и подписью)</button>
            <button onClick={() => startCall(`${order.id}-client`, 'Курьер')} className="btn-primary" style={{ background: '#6c757d' }}>📞 Позвонить клиенту</button>
          </div>
        </div>
      ))}
      {orders.length === 0 && <p>Нет активных заданий</p>}

      {showDeliveryModal && (
        <DeliveryConfirmationModal
          orderId={currentOrderId!}
          onClose={() => { setShowDeliveryModal(false); setCurrentOrderId(null); }}
          onConfirm={handleDeliveryConfirm}
        />
      )}
      {showReceipt && deliveredOrder && (
        <Receipt order={deliveredOrder} onClose={() => { setShowReceipt(false); setDeliveredOrder(null); }} />
      )}
      {showCall && (
        <VideoCall roomName={callRoom} userName={callUserName} onClose={() => setShowCall(false)} />
      )}

      {/* Голосовой помощник */}
      <LanguageSwitcher onLanguageChange={setVoiceLang} />
      <VoiceAssistant 
        onCommand={handleVoiceCommand} 
        language={voiceLang}
        ordersCount={ordersCount}
        rating={rating}
        todayEarnings={todayEarnings}
      />
    </div>
  );
}