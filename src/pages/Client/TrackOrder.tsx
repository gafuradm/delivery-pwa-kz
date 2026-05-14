import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadYandexMaps } from '../../lib/yandexMaps';
import VideoCall from '../../components/VideoCall';
import SignatureCanvas from 'react-signature-canvas';
import Receipt from '../../components/Receipt';
import { useTheme } from '../../context/ThemeContext';

declare global {
  interface Window {
    _trackMapCreating?: boolean;
  }
}

export default function TrackOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [courierLocation, setCourierLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [deliveredOrder, setDeliveredOrder] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();
  
  const signatureRef = useRef<SignatureCanvas>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Загрузка заказа и проверка доступа
  useEffect(() => {
    if (!id) return;
    const fetchOrder = async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).single();
      if (error || !data) {
        showToast('Заказ не найден', 'error');
        navigate('/');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || data.client_id !== user.id) {
        setAccessDenied(true);
        showToast('У вас нет доступа к этому заказу', 'error');
        navigate('/');
        return;
      }
      setOrder(data);
      const { data: eventsData } = await supabase.from('order_events').select('*').eq('order_id', id).order('created_at', { ascending: false });
      setEvents(eventsData || []);
    };
    fetchOrder();
  }, [id, navigate]);

  // Подписка на геолокацию курьера
  useEffect(() => {
    if (!order?.courier_id) return;
    
    const channel = supabase.channel(`courier-${order.courier_id}`).on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'courier_locations', 
      filter: `courier_id=eq.${order.courier_id}` 
    }, (payload) => {
      const newLoc = payload.new as { lat: number; lng: number };
      setCourierLocation({ lat: newLoc.lat, lng: newLoc.lng });
      if (mapRef.current && courierMarkerRef.current) {
        courierMarkerRef.current.geometry.setCoordinates([newLoc.lat, newLoc.lng]);
        mapRef.current.panTo([newLoc.lat, newLoc.lng]);
      }
    }).subscribe();
    
    supabase.from('courier_locations').select('lat, lng').eq('courier_id', order.courier_id).single().then(({ data }) => { 
      if (data) setCourierLocation({ lat: data.lat, lng: data.lng }); 
    });
    
    return () => { supabase.removeChannel(channel); };
  }, [order?.courier_id]);

  // Инициализация карты
  useEffect(() => {
    if (!order) return;
    if (mapRef.current || window._trackMapCreating) return;
    window._trackMapCreating = true;
    
    loadYandexMaps().then((ymaps) => {
      ymapsRef.current = ymaps;
      
      const container = document.getElementById('track-map');
      if (container) {
        container.innerHTML = '';
      }
      
      const match = order.from_coords?.match(/\(([^,]+),([^)]+)\)/);
      const matchTo = order.to_coords?.match(/\(([^,]+),([^)]+)\)/);
      if (!match || !matchTo) {
        window._trackMapCreating = false;
        return;
      }
      
      const fromCoords = [parseFloat(match[1]), parseFloat(match[2])];
      const toCoords = [parseFloat(matchTo[1]), parseFloat(matchTo[2])];
      
      const map = new ymaps.Map('track-map', { 
        center: fromCoords, 
        zoom: 12, 
        controls: ['zoomControl', 'fullscreenControl'] 
      });
      map.controls.add('trafficControl');
      mapRef.current = map;
      
      // Добавляем метки склада и получателя
      map.geoObjects.add(new ymaps.Placemark(fromCoords, { 
        balloonContent: '📦 Склад (отправление)' 
      }, { preset: 'islands#greenDotIcon' }));
      
      map.geoObjects.add(new ymaps.Placemark(toCoords, { 
        balloonContent: '🏠 Получатель' 
      }, { preset: 'islands#redDotIcon' }));
      
      // Добавляем маршрут
      const multiRoute = new ymaps.multiRouter.MultiRoute({ 
        referencePoints: [fromCoords, toCoords], 
        params: { routingMode: 'auto' } 
      });
      map.geoObjects.add(multiRoute);
      routeRef.current = multiRoute;
      
      // Добавляем метку курьера, если есть
      if (courierLocation) {
        const marker = new ymaps.Placemark([courierLocation.lat, courierLocation.lng], 
          { balloonContent: '🚚 Курьер' }, 
          { preset: 'islands#blueCarIcon' }
        );
        map.geoObjects.add(marker);
        courierMarkerRef.current = marker;
      }
      
      window._trackMapCreating = false;
    }).catch(err => {
      console.error('Ошибка загрузки карты:', err);
      window._trackMapCreating = false;
    });
  }, [order]);

  // Обновление метки курьера на карте
  useEffect(() => {
    if (mapRef.current && courierLocation && courierMarkerRef.current) {
      courierMarkerRef.current.geometry.setCoordinates([courierLocation.lat, courierLocation.lng]);
      mapRef.current.panTo([courierLocation.lat, courierLocation.lng]);
    } else if (mapRef.current && courierLocation && !courierMarkerRef.current && ymapsRef.current) {
      const marker = new ymapsRef.current.Placemark([courierLocation.lat, courierLocation.lng], 
        { balloonContent: '🚚 Курьер' }, 
        { preset: 'islands#blueCarIcon' }
      );
      mapRef.current.geoObjects.add(marker);
      courierMarkerRef.current = marker;
    }
  }, [courierLocation]);

  const confirmDelivery = async () => {
    const signatureDataURL = signatureRef.current?.toDataURL();
    if (!signatureDataURL || signatureDataURL === 'data:,') {
      showToast('Поставьте подпись', 'error');
      return;
    }
    setConfirming(true);
    const signatureBlob = await fetch(signatureDataURL).then(r => r.blob());
    const signaturePath = `client_signatures/${order.id}_${Date.now()}.png`;
    const { error: sigError } = await supabase.storage.from('delivery').upload(signaturePath, signatureBlob);
    if (sigError) {
      showToast('Ошибка загрузки подписи: ' + sigError.message, 'error');
      setConfirming(false);
      return;
    }
    const { data: sigPublic } = supabase.storage.from('delivery').getPublicUrl(signaturePath);
    const { error } = await supabase.from('orders').update({ 
      status: 'delivered', 
      client_signature_url: sigPublic.publicUrl 
    }).eq('id', order.id);
    
    if (!error) {
      await supabase.from('order_events').insert({ 
        order_id: order.id, 
        status: 'delivered', 
        message: 'Клиент подтвердил получение' 
      });
      const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', order.id).single();
      setDeliveredOrder(updatedOrder);
      setShowReceipt(true);
      setShowConfirmModal(false);
      showToast('✅ Заказ успешно подтверждён! Спасибо за покупку.', 'success');
    } else {
      showToast('Ошибка: ' + error.message, 'error');
    }
    setConfirming(false);
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string; bg: string }> = {
      pending: { label: 'Ожидает назначения курьера', color: '#f59e0b', icon: '⏳', bg: 'rgba(245, 158, 11, 0.1)' },
      accepted: { label: 'Заказ принят', color: '#3b82f6', icon: '✅', bg: 'rgba(59, 130, 246, 0.1)' },
      picked_up: { label: 'Забран со склада', color: '#8b5cf6', icon: '📦', bg: 'rgba(139, 92, 246, 0.1)' },
      in_transit: { label: 'В пути к получателю', color: '#10b981', icon: '🚗', bg: 'rgba(16, 185, 129, 0.1)' },
      waiting_client_confirmation: { label: 'Ожидает вашего подтверждения', color: '#ec4899', icon: '📝', bg: 'rgba(236, 72, 153, 0.1)' },
      delivered: { label: 'Доставлен', color: '#6b7280', icon: '🏠', bg: 'rgba(107, 114, 128, 0.1)' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', icon: '📋', bg: 'rgba(107, 114, 128, 0.1)' };
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

  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '0.75rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'transform 0.2s',
  };

  if (accessDenied) return null;

  const statusInfo = order ? getStatusInfo(order.status) : null;

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
            Отслеживание заказа
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Следите за статусом доставки и местоположением курьера
          </p>
        </div>

        {/* Карта */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div id="track-map" style={{ width: '100%', height: '450px' }}></div>
        </div>

        {/* Информация о заказе */}
        {order && (
          <div style={{ ...cardStyle, background: statusInfo?.bg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📦 Заказ #{order.id.slice(0, 8)}
              </h3>
              <span style={{
                background: statusInfo?.color,
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                {statusInfo?.icon} {statusInfo?.label}
              </span>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.25rem' }}>📍 Откуда</div>
                <div style={{ fontWeight: 500 }}>{order.from_address}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.25rem' }}>🎯 Куда</div>
                <div style={{ fontWeight: 500 }}>{order.to_address}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Вес</div>
                  <div style={{ fontWeight: 600 }}>{order.weight_kg} кг</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Цена</div>
                  <div style={{ fontWeight: 600, color: '#10b981' }}>{order.price?.toLocaleString()} ₸</div>
                </div>
                {order.fragile && (
                  <div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Хрупкий</div>
                    <div style={{ fontWeight: 600, color: '#f59e0b' }}>💔 Да</div>
                  </div>
                )}
              </div>
            </div>

            {/* Курьер */}
            {order.courier_id && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>👨‍✈️ Курьер</div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {courierLocation ? '🚚 В движении' : '⏳ Ожидание данных...'}
                    </div>
                  </div>
                  <button
                    onClick={() => { setCallRoom(`order-${order.id}-courier`); setShowCall(true); }}
                    style={{
                      ...buttonStyle,
                      background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                      color: 'white',
                    }}
                  >
                    📞 Позвонить курьеру
                  </button>
                </div>
              </div>
            )}

            {/* Кнопка подтверждения */}
            {order.status === 'waiting_client_confirmation' && (
              <button
                onClick={() => setShowConfirmModal(true)}
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  width: '100%',
                  fontSize: '1rem',
                  padding: '0.75rem',
                }}
              >
                ✅ Подтвердить получение заказа
              </button>
            )}
          </div>
        )}

        {/* История событий */}
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📋 История событий
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {events.map((event, index) => (
              <div
                key={event.id}
                style={{
                  padding: '0.75rem',
                  background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  borderRadius: '0.75rem',
                  borderLeft: `3px solid ${event.status === 'delivered' ? '#10b981' : '#4f46e5'}`,
                  animation: 'fadeInUp 0.3s ease-out',
                  animationDelay: `${index * 0.03}s`,
                  animationFillMode: 'both',
                }}
              >
                <strong style={{ color: '#4f46e5' }}>{new Date(event.created_at).toLocaleTimeString()}</strong>
                <span> — {event.message || event.status}</span>
              </div>
            ))}
            {events.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                Нет событий для отображения
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно подтверждения */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }} onClick={() => setShowConfirmModal(false)}>
          <div style={{ ...cardStyle, maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ✍️ Подтверждение получения заказа
            </h3>
            <p style={{ marginBottom: '0.5rem' }}>Поставьте вашу подпись:</p>
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                width: 400,
                height: 150,
                style: {
                  border: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                  borderRadius: '0.75rem',
                  width: '100%',
                  height: '150px'
                }
              }}
            />
            <button
              onClick={() => signatureRef.current?.clear()}
              style={{
                ...buttonStyle,
                background: theme === 'dark' ? '#334155' : '#e2e8f0',
                color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                marginTop: '0.5rem',
              }}
            >
              🧹 Очистить
            </button>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={confirmDelivery}
                disabled={confirming}
                style={{
                  flex: 1,
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                }}
              >
                {confirming ? '⏳ Подтверждение...' : '✅ Подтвердить'}
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1,
                  ...buttonStyle,
                  background: theme === 'dark' ? '#334155' : '#e2e8f0',
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                }}
              >
                ❌ Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Видеозвонок */}
      {showCall && (
        <VideoCall
          roomName={callRoom}
          userName="Клиент"
          onClose={() => setShowCall(false)}
        />
      )}

      {/* Чек доставки */}
      {showReceipt && deliveredOrder && (
        <Receipt
          order={deliveredOrder}
          onClose={() => { setShowReceipt(false); setDeliveredOrder(null); }}
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