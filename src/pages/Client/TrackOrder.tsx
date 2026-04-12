import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadYandexMaps } from '../../lib/yandexMaps';
import VideoCall from '../../components/VideoCall';
import SignatureCanvas from 'react-signature-canvas';
import Receipt from '../../components/Receipt';
import { cacheOrder, getCachedOrders, addOfflineAction, getOfflineActions, clearOfflineActions } from '../../lib/db';
import { Link } from 'react-router-dom';

export default function TrackOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [courierLocation, setCourierLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const mapRef = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const signatureRef = useRef<SignatureCanvas>(null);
  const [confirming, setConfirming] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [deliveredOrder, setDeliveredOrder] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Загрузка заказа (кеш + сеть)
  useEffect(() => {
    if (!id) return;

    const fetchOrder = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }

      // Сначала из кеша
      const cachedOrders = await getCachedOrders();
      const cachedOrder = cachedOrders.find(o => o.id === id);
      if (cachedOrder && cachedOrder.client_id === user.id) {
        setOrder(cachedOrder);
        setEvents(cachedOrder.events || []);
      } else {
        // Если в кеше нет, показываем заглушку
        setOrder(null);
      }

      // Если онлайн, загружаем свежие данные
      if (isOnline) {
        const { data: freshOrder, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', id)
          .single();
        if (error || !freshOrder) {
          if (!cachedOrder) alert('Заказ не найден');
          navigate('/');
          return;
        }
        if (freshOrder.client_id !== user.id) {
          setAccessDenied(true);
          alert('У вас нет доступа к этому заказу');
          navigate('/');
          return;
        }
        setOrder(freshOrder);
        await cacheOrder(freshOrder);

        const { data: eventsData } = await supabase
          .from('order_events')
          .select('*')
          .eq('order_id', id)
          .order('created_at', { ascending: false });
        setEvents(eventsData || []);
        // Сохраняем события вместе с заказом? Упростим: будем хранить отдельно, но можно расширить.
      }
    };

    fetchOrder();
  }, [id, navigate, isOnline]);

  // Подписка на геолокацию курьера (только онлайн)
  useEffect(() => {
    if (!order?.courier_id || !isOnline) return;

    const channel = supabase
      .channel(`courier-${order.courier_id}`)
      .on('postgres_changes', {
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
      })
      .subscribe();

    supabase
      .from('courier_locations')
      .select('lat, lng')
      .eq('courier_id', order.courier_id)
      .single()
      .then(({ data }) => {
        if (data) setCourierLocation({ lat: data.lat, lng: data.lng });
      });

    return () => { supabase.removeChannel(channel); };
  }, [order?.courier_id, isOnline]);

  // Карта (аналогично прежней версии)
  useEffect(() => {
    if (!order) return;
    loadYandexMaps().then((ymaps) => {
      const match = order.from_coords.match(/\(([^,]+),([^)]+)\)/);
      const matchTo = order.to_coords.match(/\(([^,]+),([^)]+)\)/);
      if (!match || !matchTo) return;
      const fromCoords = [parseFloat(match[1]), parseFloat(match[2])];
      const toCoords = [parseFloat(matchTo[1]), parseFloat(matchTo[2])];
      const map = new ymaps.Map('track-map', {
        center: fromCoords,
        zoom: 12,
        controls: ['zoomControl', 'fullscreenControl']
      });
      map.controls.add('trafficControl');
      mapRef.current = map;
      map.geoObjects.add(new ymaps.Placemark(fromCoords, { balloonContent: 'Склад' }));
      map.geoObjects.add(new ymaps.Placemark(toCoords, { balloonContent: 'Получатель' }));
      const multiRoute = new ymaps.multiRouter.MultiRoute({
        referencePoints: [fromCoords, toCoords],
        params: { routingMode: 'auto' }
      });
      map.geoObjects.add(multiRoute);
      if (courierLocation) {
        const marker = new ymaps.Placemark([courierLocation.lat, courierLocation.lng], {
          balloonContent: '🚚 Курьер'
        }, { preset: 'islands#blueCarIcon' });
        map.geoObjects.add(marker);
        courierMarkerRef.current = marker;
      } else if (order.courier_id) {
        const marker = new ymaps.Placemark([0, 0], { balloonContent: '🚚 Курьер' }, { preset: 'islands#blueCarIcon' });
        map.geoObjects.add(marker);
        courierMarkerRef.current = marker;
      }
    });
  }, [order]);

  useEffect(() => {
    if (mapRef.current && courierLocation && courierMarkerRef.current) {
      courierMarkerRef.current.geometry.setCoordinates([courierLocation.lat, courierLocation.lng]);
      mapRef.current.panTo([courierLocation.lat, courierLocation.lng]);
    } else if (mapRef.current && courierLocation && !courierMarkerRef.current) {
      const ymaps = (window as any).ymaps;
      const marker = new ymaps.Placemark([courierLocation.lat, courierLocation.lng], {
        balloonContent: '🚚 Курьер'
      }, { preset: 'islands#blueCarIcon' });
      mapRef.current.geoObjects.add(marker);
      courierMarkerRef.current = marker;
    }
  }, [courierLocation]);

  const confirmDelivery = async () => {
    const signatureDataURL = signatureRef.current?.toDataURL();
    if (!signatureDataURL || signatureDataURL === 'data:,') {
      alert('Поставьте подпись');
      return;
    }
    setConfirming(true);
    if (isOnline) {
      const signatureBlob = await fetch(signatureDataURL).then(r => r.blob());
      const signaturePath = `client_signatures/${order.id}_${Date.now()}.png`;
      const { error: sigError } = await supabase.storage.from('delivery').upload(signaturePath, signatureBlob);
      if (sigError) {
        alert('Ошибка загрузки подписи: ' + sigError.message);
        setConfirming(false);
        return;
      }
      const { data: sigPublic } = supabase.storage.from('delivery').getPublicUrl(signaturePath);
      const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered', client_signature_url: sigPublic.publicUrl })
        .eq('id', order.id);
      if (!error) {
        await supabase.from('order_events').insert({ order_id: order.id, status: 'delivered', message: 'Клиент подтвердил получение' });
        const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', order.id).single();
        setDeliveredOrder(updatedOrder);
        setShowReceipt(true);
        setShowConfirmModal(false);
        await cacheOrder(updatedOrder);
      } else {
        alert('Ошибка: ' + error.message);
      }
    } else {
      // Офлайн: сохраняем действие
      await addOfflineAction('confirmDelivery', { orderId: order.id, signatureDataURL });
      alert('Действие сохранено. Будет синхронизировано при подключении к интернету.');
      setShowConfirmModal(false);
    }
    setConfirming(false);
  };

  const statusMap: Record<string, string> = {
    pending: '⏳ Ожидает назначения курьера',
    accepted: '✅ Заказ принят',
    picked_up: '📦 Забран со склада',
    in_transit: '🚗 В пути к получателю',
    waiting_client_confirmation: '📝 Ожидает вашего подтверждения',
    delivered: '🏠 Доставлен'
  };

  if (accessDenied) return null;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Отслеживание заказа #{id?.slice(0, 8)}</h1>
        <div>
          <Link to="/profile" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>👤 Профиль</Link>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')} className="btn-primary" style={{ background: '#dc2626' }}>Выйти</button>
        </div>
      </div>
      <div id="track-map" style={{ width: '100%', height: '400px', borderRadius: 8, marginBottom: 20 }}></div>
      {order && (
        <div style={{ background: 'white', padding: 20, borderRadius: 10, margin: '20px 0' }}>
          <h3>Статус: {statusMap[order.status]}</h3>
          <p>📦 Откуда: {order.from_address}</p>
          <p>🎯 Куда: {order.to_address}</p>
          <p>💰 Цена: {order.price} ₸</p>
          {order.courier_id && (
            <>
              <p>👨‍✈️ Курьер назначен {courierLocation ? '(в движении)' : '(ждём данные...)'}</p>
              <button onClick={() => { setCallRoom(`order-${order.id}-courier`); setShowCall(true); }} className="btn-primary" style={{ background: '#6c757d', marginTop: 10 }}>📞 Позвонить курьеру</button>
            </>
          )}
          {order.status === 'waiting_client_confirmation' && (
            <button onClick={() => setShowConfirmModal(true)} className="btn-primary" style={{ background: '#10b981', marginTop: 10 }}>✅ Подтвердить получение</button>
          )}
        </div>
      )}
      <h3>📋 История событий</h3>
      {events.map(event => (
        <div key={event.id} style={{ background: '#f9fafb', padding: 10, margin: '10px 0', borderRadius: 8 }}>
          <strong>{new Date(event.created_at).toLocaleTimeString()}</strong>: {event.message || event.status}
        </div>
      ))}
      {showCall && <VideoCall roomName={callRoom} userName="Клиент" onClose={() => setShowCall(false)} />}
      {showConfirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'white', padding: 20, borderRadius: 10, maxWidth: '90%' }}>
            <h3>Подтверждение получения заказа</h3>
            <p>Поставьте вашу подпись:</p>
            <SignatureCanvas ref={signatureRef} canvasProps={{ width: 300, height: 150, style: { border: '1px solid #ccc' } }} />
            <button onClick={() => signatureRef.current?.clear()}>Очистить</button>
            <div style={{ marginTop: 20 }}>
              <button onClick={confirmDelivery} disabled={confirming}>Подтвердить</button>
              <button onClick={() => setShowConfirmModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      {showReceipt && deliveredOrder && <Receipt order={deliveredOrder} onClose={() => { setShowReceipt(false); setDeliveredOrder(null); }} />}
    </div>
  );
}