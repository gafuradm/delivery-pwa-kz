import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import VideoCall from '../../components/VideoCall';
import { cacheOrder, getCachedOrders, addOfflineAction, getOfflineActions, clearOfflineActions } from '../../lib/db';
import { Link } from 'react-router-dom';

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  picked_quantity: number;
  cell_code: string;
  products: Product;
}

interface PickingTask {
  id: string;
  order_id: string;
  status: string;
  order: { from_address: string; to_address: string; client_id: string } | null;
  items: OrderItem[];
}

export default function CollectorTasks() {
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<'cell' | 'product' | null>(null);
  const [currentItem, setCurrentItem] = useState<OrderItem | null>(null);
  const [expectedCellCode, setExpectedCellCode] = useState<string>('');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [callUserName, setCallUserName] = useState('');
  const [collectorInfo, setCollectorInfo] = useState<{ phone?: string; full_name?: string; rating?: number }>({});
  const [clientPhone, setClientPhone] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('phone, full_name, rating')
          .eq('id', user.id)
          .single();
        if (data) setCollectorInfo(data);
      }
    };
    fetchProfile();
  }, []);

  const loadTasks = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (isOnline) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('picking_tasks')
        .select('*')
        .eq('collector_id', user.id)
        .order('created_at', { ascending: false });
      if (tasksError) return;
      
      const enriched = await Promise.all(tasksData.map(async (task) => {
        const { data: order } = await supabase
          .from('orders')
          .select('from_address, to_address, client_id')
          .eq('id', task.order_id)
          .single();
        const { data: items } = await supabase
          .from('order_items')
          .select(`
            id, product_id, quantity, picked_quantity, cell_code,
            products ( id, name, sku )
          `)
          .eq('order_id', task.order_id);
        if (order?.client_id && !clientPhone) {
          const { data: clientProfile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', order.client_id)
            .single();
          if (clientProfile?.phone) setClientPhone(clientProfile.phone);
        }
        return { ...task, order, items: items || [] };
      }));
      setTasks(enriched);
      for (const task of enriched) await cacheOrder(task);
    } else {
      const cached = await getCachedOrders();
      setTasks(cached as any);
    }
  };

  // Синхронизация
  useEffect(() => {
    const syncOfflineActions = async () => {
      const actions = await getOfflineActions();
      for (const action of actions) {
        if (action.action === 'updatePicking') {
          await supabase.from('order_items').update({ picked_quantity: action.data.picked_quantity }).eq('id', action.data.itemId);
        }
      }
      await clearOfflineActions();
      loadTasks();
    };
    if (isOnline) syncOfflineActions();
  }, [isOnline]);

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
    loadTasks();
    const channel = supabase
      .channel('collector-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_tasks' }, () => loadTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isOnline]);

  const startTask = async (taskId: string) => {
    await supabase.from('picking_tasks').update({ status: 'in_progress' }).eq('id', taskId);
    loadTasks();
  };

  const startCollectItem = async (item: OrderItem) => {
    const expectedCell = item.cell_code;
    if (!expectedCell) {
      alert('Для этого товара не указана ячейка');
      return;
    }
    setCurrentItem(item);
    setExpectedCellCode(expectedCell);
    setScanType('cell');
    setScanning(true);
  };

  const handleScan = async (scannedValue: string) => {
    if (scanType === 'cell') {
      if (scannedValue === expectedCellCode) {
        alert('Ячейка подтверждена! Теперь отсканируйте товар.');
        setScanType('product');
      } else {
        alert(`Неверная ячейка. Ожидается: ${expectedCellCode}`);
        setScanning(false);
        setScanType(null);
        setCurrentItem(null);
      }
    } else if (scanType === 'product' && currentItem) {
      if (scannedValue === currentItem.products.sku) {
        const newPicked = currentItem.picked_quantity + 1;
        if (isOnline) {
          await supabase.from('order_items').update({ picked_quantity: newPicked }).eq('id', currentItem.id);
          await supabase.rpc('decrease_stock_by_cell', { product_id: currentItem.product_id, cell_code: expectedCellCode, qty: 1 });
          const task = tasks.find(t => t.id === currentTaskId);
          if (task) {
            const { data: allItems } = await supabase
              .from('order_items')
              .select('quantity, picked_quantity')
              .eq('order_id', task.order_id);
            const total = allItems?.reduce((sum, i) => sum + i.quantity, 0) || 0;
            const picked = allItems?.reduce((sum, i) => sum + i.picked_quantity, 0) || 0;
            if (total === picked) {
              await supabase.rpc('check_picking_complete', { task_id: task.id });
              alert('Сборка заказа завершена! Статус заказа изменён на "Готов к доставке".');
            }
          }
          loadTasks();
        } else {
          await addOfflineAction('updatePicking', { itemId: currentItem.id, picked_quantity: newPicked });
          setCurrentItem(prev => prev ? { ...prev, picked_quantity: newPicked } : null);
          alert('Товар добавлен офлайн. Синхронизируется позже.');
        }
        alert('Товар добавлен в сборку');
      } else {
        alert(`Неверный товар. Ожидается: ${currentItem.products.sku}`);
      }
      setScanning(false);
      setScanType(null);
      setCurrentItem(null);
    }
  };

  // Камера
  useEffect(() => {
    if (!scanning) return;
    if (!('BarcodeDetector' in window)) {
      alert('Ваш браузер не поддерживает сканирование штрихкодов');
      setScanning(false);
      return;
    }
    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128', 'code_39'] });
    const video = document.createElement('video');
    let stream: MediaStream | null = null;
    let animationId: number;

    const startCamera = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.play();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const scanLoop = async () => {
        if (video.videoWidth && video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context?.drawImage(video, 0, 0);
          const imageData = context?.getImageData(0, 0, canvas.width, canvas.height);
          if (imageData) {
            const barcodes = await detector.detect(imageData);
            if (barcodes.length > 0) {
              handleScan(barcodes[0].rawValue);
              stream?.getTracks().forEach(t => t.stop());
              cancelAnimationFrame(animationId);
              return;
            }
          }
        }
        animationId = requestAnimationFrame(scanLoop);
      };
      scanLoop();
    };
    startCamera().catch(err => console.error(err));
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animationId);
    };
  }, [scanning]);

  const startCall = (roomSuffix: string, userName: string) => {
    setCallRoom(`collector-${roomSuffix}`);
    setCallUserName(userName);
    setShowCall(true);
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>Сборщик заказов</h1>
          <div>
            <Link to="/profile" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>👤 Профиль</Link>
            <Link to="/performance" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>📊 Моя эффективность</Link>
            <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')} className="btn-primary" style={{ background: '#dc2626' }}>Выйти</button>
          </div>
        </div>
        <h1>Сборщик заказов {collectorInfo.full_name ? `(${collectorInfo.full_name})` : ''}</h1>
        <div>⭐ Рейтинг: {collectorInfo.rating?.toFixed(1) || '5.0'}</div>
      </div>
      <button onClick={loadTasks} className="btn-primary" style={{ marginBottom: 10 }}>🔄 Обновить</button>
      {!isOnline && <div style={{ background: '#fee2e2', padding: 8, borderRadius: 8, marginBottom: 10 }}>⚠️ Офлайн-режим. Действия будут синхронизированы позже.</div>}
      {collectorInfo.phone && <p>📞 Ваш телефон: {collectorInfo.phone}</p>}
      
      {tasks.map(task => (
        <div key={task.id} style={{ background: '#f3f4f6', padding: 15, margin: 10, borderRadius: 10 }}>
          <p><strong>Заказ #{task.order_id.slice(0,8)}</strong> | Статус: {task.status}</p>
          <p>Откуда: {task.order?.from_address}</p>
          <p>Куда: {task.order?.to_address}</p>
          
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => startCall(`dispatcher`, 'Сборщик')} className="btn-primary" style={{ background: '#6c757d' }}>📞 Позвонить диспетчеру</button>
            {clientPhone && (
              <button onClick={() => startCall(`client-${task.order?.client_id}`, 'Сборщик')} className="btn-primary" style={{ background: '#6c757d' }}>📞 Позвонить клиенту</button>
            )}
          </div>
          
          {task.status === 'pending' && (
            <button onClick={() => { setCurrentTaskId(task.id); startTask(task.id); }} className="btn-primary">Начать сборку</button>
          )}
          {task.status === 'in_progress' && (
            <div>
              <h4>Товары к сборке:</h4>
              {task.items.map(item => (
                <div key={item.id} style={{ background: 'white', margin: 5, padding: 10 }}>
                  <strong>{item.products.name}</strong> (x{item.quantity}) – собрано: {item.picked_quantity}
                  {item.cell_code && <div>📦 Ячейка: {item.cell_code}</div>}
                  {item.picked_quantity < item.quantity && (
                    <button onClick={() => startCollectItem(item)} style={{ marginLeft: 10 }}>📷 Собрать</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {tasks.length === 0 && <p>Нет активных заданий</p>}
      
      {scanning && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'black', zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <video autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button onClick={() => { setScanning(false); setScanType(null); setCurrentItem(null); }} style={{ position: 'absolute', bottom: 20, background: 'red', color: 'white', padding: 10, borderRadius: 8 }}>Отмена</button>
          <div style={{ position: 'absolute', top: 20, color: 'white', background: 'rgba(0,0,0,0.7)', padding: 8, borderRadius: 8 }}>
            {scanType === 'cell' ? 'Отсканируйте штрихкод ЯЧЕЙКИ' : 'Отсканируйте штрихкод ТОВАРА'}
          </div>
        </div>
      )}
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