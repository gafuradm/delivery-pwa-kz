import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadYandexMaps, getRouteDistance } from '../../lib/yandexMaps';
import DeliveryConfirmationModal from '../../components/DeliveryConfirmationModal';
import Receipt from '../../components/Receipt';
import VideoCall from '../../components/VideoCall';
import { cacheOrder, getCachedOrders, addOfflineAction, getOfflineActions, clearOfflineActions } from '../../lib/db';
import VoiceAssistant from '../../components/VoiceAssistant';
import LanguageSwitcher from '../../components/LanguageSwitcher';

declare global {
  interface Window {
    _mapCreating?: boolean;
  }
}

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

// Универсальный парсинг координат
const parseCoords = (coordStr: string): { lat: number; lng: number } => {
  const cleaned = coordStr.replace(/[()]/g, '');
  const [lat, lng] = cleaned.split(',').map(Number);
  return { lat, lng };
};

export default function Tasks() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
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
  
  // Refs для карты (только одна карта!)
  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const courierMarkerRef = useRef<any>(null);

  // Загрузка профиля
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

  // Загрузка заказов
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

  // Оптимизация маршрута (эвристика ближайшего соседа)
  const optimizeRouteAsync = async (location: { lat: number; lng: number }, ordersList: Order[]) => {
    if (ordersList.length === 0) return [];
    
    const points: Point[] = [];
    for (const order of ordersList) {
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

    const unvisited = [...points];
    const sequence: Point[] = [];
    let current = location;
    
    while (unvisited.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const dist = Math.hypot(current.lat - unvisited[i].lat, current.lng - unvisited[i].lng);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const next = unvisited[bestIdx];
      sequence.push(next);
      current = { lat: next.lat, lng: next.lng };
      unvisited.splice(bestIdx, 1);
    }
    
    return sequence;
  };

  // Построение маршрута на карте
  const buildRouteOnMap = async (ymaps: any, map: any, points: Point[]) => {
    if (!map || !ymaps || points.length < 2) return;
    
    if (routeRef.current) {
      map.geoObjects.remove(routeRef.current);
    }
    
    const coords = points.map(p => [p.lat, p.lng]);
    
    const multiRoute = new ymaps.multiRouter.MultiRoute({
      referencePoints: coords,
      params: { routingMode: 'auto' }
    });
    
    map.geoObjects.add(multiRoute);
    routeRef.current = multiRoute;
    
    if (coords.length > 0) {
      map.setBounds(multiRoute.getBounds(), { checkZoomRange: true });
    }
  };

  // Создание меток на карте
  const updateMarkers = (ymaps: any, map: any, points: Point[]) => {
    if (!map || !ymaps) return;
    
    markersRef.current.forEach(marker => map.geoObjects.remove(marker));
    markersRef.current = [];
    
    points.forEach(point => {
      const color = point.type === 'pickup' ? '#10b981' : '#ef4444';
      const icon = point.type === 'pickup' ? '📦' : '🏠';
      const marker = new ymaps.Placemark([point.lat, point.lng], {
        balloonContent: `${icon} ${point.address}`,
        hintContent: point.type === 'pickup' ? 'Склад' : 'Клиент'
      }, {
        preset: 'islands#circleIcon',
        iconColor: color
      });
      map.geoObjects.add(marker);
      markersRef.current.push(marker);
    });
  };

  // Инициализация карты (только один раз!)
  useEffect(() => {
    if (mapRef.current || window._mapCreating) return;
    window._mapCreating = true;
    
    loadYandexMaps().then((ym) => {
      ymapsRef.current = ym;
      
      // Очищаем контейнер от старых карт
      const container = document.getElementById('courier-map');
      if (container) {
        container.innerHTML = '';
      }
      
      const newMap = new ym.Map('courier-map', {
        center: currentLocation ? [currentLocation.lat, currentLocation.lng] : [43.2567, 76.9286],
        zoom: 12,
        controls: ['zoomControl', 'fullscreenControl']
      });
      newMap.controls.add('trafficControl');
      mapRef.current = newMap;
      
      if (currentLocation) {
        const marker = new ym.Placemark([currentLocation.lat, currentLocation.lng], {
          balloonContent: '🚚 Вы здесь'
        }, { preset: 'islands#blueCarIcon' });
        newMap.geoObjects.add(marker);
        courierMarkerRef.current = marker;
      }
      
      window._mapCreating = false;
    }).catch(err => {
      console.error('Ошибка загрузки карты:', err);
      window._mapCreating = false;
    });
  }, []);

  // Обновление метки курьера
  useEffect(() => {
    if (mapRef.current && ymapsRef.current && currentLocation) {
      if (courierMarkerRef.current) {
        courierMarkerRef.current.geometry.setCoordinates([currentLocation.lat, currentLocation.lng]);
      } else {
        const marker = new ymapsRef.current.Placemark([currentLocation.lat, currentLocation.lng], {
          balloonContent: '🚚 Вы здесь'
        }, { preset: 'islands#blueCarIcon' });
        mapRef.current.geoObjects.add(marker);
        courierMarkerRef.current = marker;
      }
    }
  }, [currentLocation]);

  // Оптимизация маршрута при изменении заказов или местоположения
  useEffect(() => {
    if (currentLocation && orders.length > 0) {
      optimizeRouteAsync(currentLocation, orders).then(sequence => {
        setOptimizedSequence(sequence);
        if (mapRef.current && ymapsRef.current && sequence.length > 0) {
          updateMarkers(ymapsRef.current, mapRef.current, sequence);
          buildRouteOnMap(ymapsRef.current, mapRef.current, sequence);
        }
      });
    } else if (orders.length === 0 && mapRef.current && ymapsRef.current) {
      markersRef.current.forEach(m => mapRef.current.geoObjects.remove(m));
      markersRef.current = [];
      if (routeRef.current) mapRef.current.geoObjects.remove(routeRef.current);
      setOptimizedSequence([]);
    }
  }, [orders, currentLocation]);

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

  // Геолокация курьера
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

  const updateStatus = async (orderId: string, newStatus: string) => {
    setLoading(true);
    if (isOnline) {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (!error) {
        await supabase.from('order_events').insert({ order_id: orderId, status: newStatus, message: `Статус изменён на ${newStatus}` });
        await cacheOrder({ ...orders.find(o => o.id === orderId), status: newStatus });
        await loadOrders();
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

  const handleVoiceCommand = (command: string) => {
    switch (command) {
      case 'profile': navigate('/profile'); break;
      case 'logout': supabase.auth.signOut().then(() => navigate('/')); break;
      case 'refresh': loadOrders(); break;
      case 'accept-order':
        if (orders.length > 0 && orders[0].status === 'pending') updateStatus(orders[0].id, 'accepted');
        else alert('Нет доступных заказов');
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
        if (orders.length > 0) window.open(`https://yandex.ru/maps/?mode=routes&rtext=${encodeURIComponent(orders[0].from_address)}`, '_blank');
        break;
      case 'navigate-to-client':
        if (orders.length > 0) window.open(`https://yandex.ru/maps/?mode=routes&rtext=${encodeURIComponent(orders[0].to_address)}`, '_blank');
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
      default: break;
    }
  };

  const ordersCount = orders.length;
  const rating = profile.rating;
  const todayEarnings = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.price || 0), 0);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>⭐ Рейтинг: {rating.toFixed(1)}</div>
      </div>
      
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={loadOrders} className="btn-primary" disabled={loading}>🔄 Обновить</button>
        {!isOnline && <span className="btn-secondary" style={{ background: '#fee2e2' }}>⚠️ Офлайн-режим</span>}
      </div>

      <div id="courier-map" style={{ width: '100%', height: '500px', borderRadius: 'var(--radius)', marginBottom: 20 }}></div>

      {orders.map(order => (
        <div key={order.id} className="card" style={{ marginBottom: 10 }}>
          <p><strong>Заказ #{order.id.slice(0, 8)}</strong></p>
          <p>📦 Откуда: {order.from_address}</p>
          <p>🎯 Куда: {order.to_address}</p>
          <p>⚖️ Вес: {order.weight_kg} кг | 💔 Хрупкий: {order.fragile ? 'Да' : 'Нет'}</p>
          <p>📌 Статус: {order.status}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <button onClick={() => updateStatus(order.id, 'accepted')} disabled={loading} className="btn-primary">✅ Принять</button>
            <button onClick={() => updateStatus(order.id, 'picked_up')} disabled={loading} className="btn-primary" style={{ background: '#f59e0b' }}>📦 Забрал</button>
            <button onClick={() => updateStatus(order.id, 'in_transit')} disabled={loading} className="btn-primary" style={{ background: '#3b82f6' }}>🚗 В пути</button>
            <button onClick={() => { setCurrentOrderId(order.id); setShowDeliveryModal(true); }} disabled={loading} className="btn-primary" style={{ background: '#10b981' }}>🏠 Доставить</button>
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