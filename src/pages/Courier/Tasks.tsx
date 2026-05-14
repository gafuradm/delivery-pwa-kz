import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadYandexMaps } from '../../lib/yandexMaps';
import DeliveryConfirmationModal from '../../components/DeliveryConfirmationModal';
import Receipt from '../../components/Receipt';
import VideoCall from '../../components/VideoCall';
import { cacheOrder, getCachedOrders, addOfflineAction, getOfflineActions, clearOfflineActions } from '../../lib/db';
import VoiceAssistant from '../../components/VoiceAssistant';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useTheme } from '../../context/ThemeContext';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const courierMarkerRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
      const { data: fresh, error } = await supabase
        .from('orders')
        .select('*')
        .eq('courier_id', user.id)
        .order('created_at', { ascending: false });
      if (error) showToast('Ошибка загрузки заказов: ' + error.message, 'error');
      if (fresh) {
        setOrders(fresh);
        for (const order of fresh) await cacheOrder(order);
      }
    } else {
      const cached = await getCachedOrders({ courierId: user.id });
      setOrders(cached);
      showToast('📱 Офлайн-режим: показаны кэшированные заказы', 'success');
    }
  };

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

  useEffect(() => {
    if (mapRef.current || window._mapCreating) return;
    window._mapCreating = true;
    
    loadYandexMaps().then((ym) => {
      ymapsRef.current = ym;
      
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

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('✅ Восстановлено подключение к интернету', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('⚠️ Нет подключения к интернету. Работаем офлайн.', 'error');
    };
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
        showToast(`✅ Статус заказа обновлён на "${newStatus}"`, 'success');
      } else {
        showToast('Ошибка: ' + error.message, 'error');
      }
    } else {
      await addOfflineAction('updateStatus', { orderId, newStatus });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      showToast('📱 Действие сохранено. Будет синхронизировано при подключении к интернету.', 'success');
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
      showToast('✅ Доставка подтверждена! Ожидайте подтверждения клиента.', 'success');
    } else {
      showToast('Ошибка: ' + error.message, 'error');
    }
    setShowDeliveryModal(false);
    setCurrentOrderId(null);
  };

  const startCall = (roomSuffix: string, userName: string) => {
    setCallRoom(`order-${roomSuffix}`);
    setCallUserName(userName);
    setShowCall(true);
  };

  // Функция для голосового ассистента
  const handleVoiceCommand = (command: string) => {
    switch (command) {
      case 'profile':
        navigate('/profile');
        break;
      case 'logout':
        supabase.auth.signOut().then(() => navigate('/'));
        break;
      case 'refresh':
        loadOrders();
        break;
      case 'accept-order':
        if (orders.length > 0 && orders[0].status === 'pending') {
          updateStatus(orders[0].id, 'accepted');
        } else {
          showToast('Нет доступных заказов для принятия', 'error');
        }
        break;
      case 'picked-up':
        if (orders.length > 0 && orders[0].status === 'accepted') {
          updateStatus(orders[0].id, 'picked_up');
        } else {
          showToast('Нет заказов в статусе "принят"', 'error');
        }
        break;
      case 'in-transit':
        if (orders.length > 0 && orders[0].status === 'picked_up') {
          updateStatus(orders[0].id, 'in_transit');
        } else {
          showToast('Нет заказов в статусе "забран"', 'error');
        }
        break;
      case 'deliver':
        if (orders.length > 0 && orders[0].status === 'in_transit') {
          setCurrentOrderId(orders[0].id);
          setShowDeliveryModal(true);
        } else {
          showToast('Нет заказов в пути', 'error');
        }
        break;
      case 'navigate-to-warehouse':
        if (orders.length > 0) {
          window.open(`https://yandex.ru/maps/?mode=routes&rtext=${encodeURIComponent(orders[0].from_address)}`, '_blank');
        } else {
          showToast('Нет активных заказов', 'error');
        }
        break;
      case 'navigate-to-client':
        if (orders.length > 0) {
          window.open(`https://yandex.ru/maps/?mode=routes&rtext=${encodeURIComponent(orders[0].to_address)}`, '_blank');
        } else {
          showToast('Нет активных заказов', 'error');
        }
        break;
      case 'call-client':
        if (orders.length > 0) {
          startCall(`${orders[0].id}-client`, 'Курьер');
        } else {
          showToast('Нет активных заказов', 'error');
        }
        break;
      case 'order-status':
        if (orders.length > 0) {
          const statuses = orders.map(o => `${o.id.slice(0, 8)}: ${o.status}`).join('\n');
          showToast(statuses, 'success');
        } else {
          showToast('Нет активных заказов', 'error');
        }
        break;
      case 'order-count':
        showToast(`У вас ${orders.length} активных заказов`, 'success');
        break;
      case 'my-rating':
        showToast(`Ваш рейтинг: ${profile.rating.toFixed(1)}`, 'success');
        break;
      default:
        console.log('Неизвестная команда:', command);
    }
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string }> = {
      pending: { label: 'В ожидании', color: '#f59e0b', icon: '⏳' },
      accepted: { label: 'Принят', color: '#3b82f6', icon: '✅' },
      picked_up: { label: 'Забран', color: '#8b5cf6', icon: '📦' },
      in_transit: { label: 'В пути', color: '#10b981', icon: '🚚' },
      waiting_client_confirmation: { label: 'Ждёт подтверждения', color: '#ec4899', icon: '📋' },
      delivered: { label: 'Доставлен', color: '#6b7280', icon: '🏁' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', icon: '📋' };
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
    marginBottom: '1rem',
    boxShadow: theme === 'dark'
      ? '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
      : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
    transition: 'all 0.3s ease',
  };

  const todayEarnings = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + (o.price || 0), 0);

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
            🚚
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Мои задания
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Управляйте доставками и отслеживайте маршрут
          </p>
        </div>

        {/* Статистика */}
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>⭐ Рейтинг</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{profile.rating.toFixed(1)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>💰 Заработано сегодня</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{todayEarnings.toLocaleString()} ₸</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>📦 Активных заказов</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4f46e5' }}>{orders.length}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={loadOrders}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.75rem',
                  border: 'none',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {loading ? '⏳...' : '🔄 Обновить'}
              </button>
              {!isOnline && (
                <span style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                }}>
                  ⚠️ Офлайн-режим
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Карта */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div id="courier-map" style={{ width: '100%', height: '450px' }}></div>
        </div>

        {/* Заказы */}
        {orders.length === 0 && !loading && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
            <h3 style={{ marginBottom: '0.5rem', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
              Нет активных заданий
            </h3>
            <p style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
              Ожидайте назначения новых заказов
            </p>
          </div>
        )}

        {orders.map((order, index) => {
          const statusInfo = getStatusInfo(order.status);
          return (
            <div
              key={order.id}
              style={{
                ...cardStyle,
                animation: 'fadeInUp 0.3s ease-out',
                animationDelay: `${index * 0.05}s`,
                animationFillMode: 'both',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📦 Заказ #{order.id.slice(0, 8)}
                </h3>
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
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span>📍</span>
                  <span><strong>Откуда:</strong> {order.from_address}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🎯</span>
                  <span><strong>Куда:</strong> {order.to_address}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.85rem', opacity: 0.8, flexWrap: 'wrap' }}>
                <span>⚖️ Вес: {order.weight_kg} кг</span>
                <span>💔 Хрупкий: {order.fragile ? 'Да' : 'Нет'}</span>
                {order.price && <span>💰 {order.price.toLocaleString()} ₸</span>}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {order.status === 'pending' && (
                  <button
                    onClick={() => updateStatus(order.id, 'accepted')}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    ✅ Принять
                  </button>
                )}
                {order.status === 'accepted' && (
                  <button
                    onClick={() => updateStatus(order.id, 'picked_up')}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    📦 Забрал
                  </button>
                )}
                {order.status === 'picked_up' && (
                  <button
                    onClick={() => updateStatus(order.id, 'in_transit')}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    🚗 В пути
                  </button>
                )}
                {order.status === 'in_transit' && (
                  <button
                    onClick={() => { setCurrentOrderId(order.id); setShowDeliveryModal(true); }}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    🏠 Доставить
                  </button>
                )}
                <button
                  onClick={() => startCall(`${order.id}-client`, 'Курьер')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  📞 Позвонить клиенту
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
        ordersCount={orders.length}
        rating={profile.rating}
        todayEarnings={todayEarnings}
      />

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