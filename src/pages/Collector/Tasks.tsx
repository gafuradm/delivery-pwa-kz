import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import VideoCall from '../../components/VideoCall';
import { cacheOrder, getCachedOrders, addOfflineAction, getOfflineActions, clearOfflineActions } from '../../lib/db';
import { useTheme } from '../../context/ThemeContext';

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
  stock_id: string;
  warehouse_id: string;
  products: Product;
  warehouse_stock?: {
    qr_code: string;
  };
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
  const [currentItem, setCurrentItem] = useState<OrderItem | null>(null);
  const [expectedQrCode, setExpectedQrCode] = useState<string>('');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState('');
  const [callUserName, setCallUserName] = useState('');
  const [collectorInfo, setCollectorInfo] = useState<{ phone?: string; full_name?: string; rating?: number }>({});
  const [clientPhone, setClientPhone] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    if (isOnline) {
      const { data: tasksData, error } = await supabase
        .from('picking_tasks')
        .select('*')
        .eq('collector_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        showToast('Ошибка загрузки заданий: ' + error.message, 'error');
      }
      
      if (!tasksData) {
        setLoading(false);
        return;
      }

      const enriched = await Promise.all(tasksData.map(async (task) => {
        const { data: order } = await supabase
          .from('orders')
          .select('from_address, to_address, client_id')
          .eq('id', task.order_id)
          .single();

        const { data: items } = await supabase
          .from('order_items')
          .select(`
            id, product_id, quantity, picked_quantity, stock_id, warehouse_id,
            products ( id, name, sku ),
            warehouse_stock ( qr_code )
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
      showToast('📱 Офлайн-режим: показаны кэшированные задания', 'success');
    }
    setLoading(false);
  };

  useEffect(() => {
    const syncOfflineActions = async () => {
      const actions = await getOfflineActions();
      for (const action of actions) {
        if (action.action === 'updatePicking') {
          await supabase
            .from('order_items')
            .update({ picked_quantity: action.data.picked_quantity })
            .eq('id', action.data.itemId);
        }
      }
      await clearOfflineActions();
      loadTasks();
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
    loadTasks();
    const channel = supabase
      .channel('collector-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_tasks' }, () => loadTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isOnline]);

  const startTask = async (taskId: string) => {
    setLoading(true);
    await supabase.from('picking_tasks').update({ status: 'in_progress' }).eq('id', taskId);
    await loadTasks();
    showToast('✅ Сборка начата!', 'success');
    setLoading(false);
  };

  const startCollectItem = async (item: OrderItem, taskId: string) => {
    if (!item.warehouse_stock?.qr_code) {
      showToast('Для этого товара не сгенерирован QR-код', 'error');
      return;
    }
    setCurrentTaskId(taskId);
    setCurrentItem(item);
    setExpectedQrCode(item.warehouse_stock.qr_code);
    setScanning(true);
  };

  const handleScan = async (scannedValue: string) => {
    if (!currentItem) return;
    
    if (scannedValue === expectedQrCode) {
      const newPicked = currentItem.picked_quantity + 1;
      
      if (isOnline) {
        const { error: updateError } = await supabase
          .from('order_items')
          .update({ picked_quantity: newPicked })
          .eq('id', currentItem.id);
        
        if (updateError) {
          showToast('Ошибка обновления: ' + updateError.message, 'error');
          setScanning(false);
          setCurrentItem(null);
          setExpectedQrCode('');
          return;
        }
        
        await supabase.rpc('decrease_warehouse_stock', {
          p_stock_id: currentItem.stock_id,
          p_quantity: 1
        });

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
            showToast('🎉 Сборка заказа завершена! Статус заказа изменён на "Готов к доставке".', 'success');
          }
        }
        await loadTasks();
        showToast(`✅ Товар "${currentItem.products.name}" собран!`, 'success');
      } else {
        await addOfflineAction('updatePicking', { itemId: currentItem.id, picked_quantity: newPicked });
        showToast('📱 Товар добавлен офлайн. Синхронизируется позже.', 'success');
      }
    } else {
      showToast('❌ Неверный QR-код. Попробуйте ещё раз.', 'error');
    }
    
    setScanning(false);
    setCurrentItem(null);
    setExpectedQrCode('');
    setCurrentTaskId(null);
  };

  // Камера для сканирования QR
  useEffect(() => {
    if (!scanning) return;
    
    let stream: MediaStream | null = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', '');
          videoRef.current.play();
        }
      } catch (err) {
        console.error('Ошибка камеры:', err);
        showToast('Не удалось получить доступ к камере', 'error');
        setScanning(false);
      }
    };
    
    startCamera();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scanning]);

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string; bg: string }> = {
      pending: { label: 'Ожидает', color: '#f59e0b', icon: '⏳', bg: 'rgba(245, 158, 11, 0.1)' },
      in_progress: { label: 'В процессе', color: '#3b82f6', icon: '📦', bg: 'rgba(59, 130, 246, 0.1)' },
      completed: { label: 'Завершён', color: '#10b981', icon: '✅', bg: 'rgba(16, 185, 129, 0.1)' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', icon: '📋', bg: 'rgba(107, 114, 128, 0.1)' };
  };

  const startCall = (roomSuffix: string, userName: string) => {
    setCallRoom(`collector-${roomSuffix}`);
    setCallUserName(userName);
    setShowCall(true);
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

  const tasksCount = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;

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
            📦
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Задания сборщика
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Сборка товаров для заказов
          </p>
        </div>

        {/* Статистика и информация */}
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>⭐ Рейтинг</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{collectorInfo.rating?.toFixed(1) || '5.0'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>📋 Всего заданий</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4f46e5' }}>{tasksCount}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>✅ Завершено</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{completedTasks}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>⚡ В процессе</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{inProgressTasks}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={loadTasks}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: 'white',
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
          {collectorInfo.phone && (
            <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}` }}>
              📞 Ваш телефон: <strong>{collectorInfo.phone}</strong>
            </div>
          )}
        </div>

        {/* Задания */}
        {!loading && tasks.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
            <h3 style={{ marginBottom: '0.5rem', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
              Нет активных заданий
            </h3>
            <p style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
              Ожидайте назначения новых заданий на сборку
            </p>
          </div>
        )}

        {tasks.map((task, index) => {
          const statusInfo = getStatusInfo(task.status);
          const totalItems = task.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
          const pickedItems = task.items?.reduce((sum, i) => sum + i.picked_quantity, 0) || 0;
          const progress = totalItems > 0 ? (pickedItems / totalItems) * 100 : 0;
          
          return (
            <div
              key={task.id}
              style={{
                ...cardStyle,
                background: statusInfo.bg,
                animation: 'fadeInUp 0.3s ease-out',
                animationDelay: `${index * 0.05}s`,
                animationFillMode: 'both',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📋 Заказ #{task.order_id.slice(0, 8)}
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
                <div style={{ marginBottom: '0.25rem' }}>📍 <strong>Откуда:</strong> {task.order?.from_address}</div>
                <div>🎯 <strong>Куда:</strong> {task.order?.to_address}</div>
              </div>

              {/* Прогресс сборки */}
              {task.status === 'in_progress' && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span>Прогресс сборки</span>
                    <span>{pickedItems} / {totalItems} товаров</span>
                  </div>
                  <div style={{
                    height: '8px',
                    background: theme === 'dark' ? '#334155' : '#e2e8f0',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                      borderRadius: '4px',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )}

              {/* Кнопки звонков */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => startCall(`dispatcher`, 'Сборщик')}
                  style={{
                    ...buttonStyle,
                    background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                    color: 'white',
                  }}
                >
                  📞 Позвонить диспетчеру
                </button>
                {clientPhone && (
                  <button
                    onClick={() => startCall(`client-${task.order?.client_id}`, 'Сборщик')}
                    style={{
                      ...buttonStyle,
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: 'white',
                    }}
                  >
                    📞 Позвонить клиенту
                  </button>
                )}
              </div>

              {/* Кнопка начала сборки */}
              {task.status === 'pending' && (
                <button
                  onClick={() => startTask(task.id)}
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    width: '100%',
                  }}
                >
                  🚀 Начать сборку
                </button>
              )}

              {/* Товары для сборки */}
              {task.status === 'in_progress' && task.items && (
                <div>
                  <h4 style={{ marginBottom: '0.75rem', marginTop: '1rem' }}>📦 Товары к сборке:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {task.items.map((item, itemIndex) => {
                      const isCompleted = item.picked_quantity >= item.quantity;
                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '0.75rem',
                            background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                            borderRadius: '0.75rem',
                            border: `1px solid ${isCompleted ? '#10b981' : theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                            animation: 'fadeInUp 0.2s ease-out',
                            animationDelay: `${itemIndex * 0.05}s`,
                            animationFillMode: 'both',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <strong>{item.products?.name}</strong>
                              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>SKU: {item.products?.sku}</div>
                              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                Собрано: {item.picked_quantity} / {item.quantity}
                              </div>
                            </div>
                            {!isCompleted && (
                              <button
                                onClick={() => startCollectItem(item, task.id)}
                                style={{
                                  ...buttonStyle,
                                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                  color: 'white',
                                }}
                              >
                                📷 Сканировать QR
                              </button>
                            )}
                            {isCompleted && (
                              <span style={{ color: '#10b981', fontSize: '0.85rem' }}>✅ Собран</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Камера для сканирования QR */}
      {scanning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'black',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '250px',
            height: '250px',
            border: '2px solid #4f46e5',
            borderRadius: '1rem',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
          }}>
            <div style={{
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.75rem',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}>
              Наведите камеру на QR-код товара
            </div>
            <button
              onClick={() => {
                setScanning(false);
                setCurrentItem(null);
                setExpectedQrCode('');
              }}
              style={{
                ...buttonStyle,
                background: '#ef4444',
                color: 'white',
                fontSize: '1rem',
                padding: '0.75rem 1.5rem',
              }}
            >
              ❌ Отмена сканирования
            </button>
          </div>
        </div>
      )}

      {/* Видеозвонок */}
      {showCall && (
        <VideoCall
          roomName={callRoom}
          userName={callUserName}
          onClose={() => setShowCall(false)}
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