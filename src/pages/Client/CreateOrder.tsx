import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadYandexMaps, geocodeAddress, getRouteDistance } from '../../lib/yandexMaps';
import { getWeatherInfo, WeatherInfo } from '../../lib/weather';
import { useTheme } from '../../context/ThemeContext';

declare global {
  interface Window {
    _createMapCreating?: boolean;
  }
}

interface CartItem {
  product_id: string;
  product_name: string;
  cell_code: string;
  quantity: number;
  sku: string;
  price: number;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const [fromAddress, setFromAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [deliveryPrice, setDeliveryPrice] = useState(0);
  const [routeInfo, setRouteInfo] = useState('');
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [toCoords, setToCoords] = useState<[number, number] | null>(null);
  const [fromConfirmed, setFromConfirmed] = useState(false);
  const [toConfirmed, setToConfirmed] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo | null>(null);
  const [totalProductsPrice, setTotalProductsPrice] = useState(0);
  const [finalPrice, setFinalPrice] = useState(0);
  const [cellCodeInput, setCellCodeInput] = useState('');
  const [productSkuInput, setProductSkuInput] = useState('');
  const [addError, setAddError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();
  
  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Инициализация карты (только один раз!)
  useEffect(() => {
    if (mapRef.current || window._createMapCreating) return;
    window._createMapCreating = true;
    
    loadYandexMaps().then((ymaps) => {
      ymapsRef.current = ymaps;
      
      const container = document.getElementById('create-order-map');
      if (container) {
        container.innerHTML = '';
      }
      
      const newMap = new ymaps.Map('create-order-map', {
        center: [43.2567, 76.9286],
        zoom: 12,
        controls: ['zoomControl', 'fullscreenControl']
      });
      newMap.controls.add('trafficControl');
      mapRef.current = newMap;
      
      window._createMapCreating = false;
    }).catch(err => {
      console.error('Ошибка загрузки карты:', err);
      window._createMapCreating = false;
    });
  }, []);

  const confirmAddress = async (type: 'from' | 'to') => {
    const address = type === 'from' ? fromAddress : toAddress;
    if (!address.trim()) {
      showToast('Введите адрес', 'error');
      return;
    }
    const coords = await geocodeAddress(address);
    if (!coords) {
      showToast('Адрес не найден. Попробуйте уточнить.', 'error');
      return;
    }
    const currentMap = mapRef.current;
    const ymaps = ymapsRef.current;
    if (!currentMap || !ymaps) return;

    if (type === 'from') {
      setFromCoords([coords.lat, coords.lng]);
      setFromConfirmed(true);
      currentMap.panTo([coords.lat, coords.lng]);
      currentMap.geoObjects.removeAll();
      currentMap.geoObjects.add(new ymaps.Placemark([coords.lat, coords.lng], { 
        balloonContent: '📦 Склад (отправление)' 
      }, { preset: 'islands#greenDotIcon' }));
      const info = await getWeatherInfo(coords.lat, coords.lng);
      setWeatherInfo(info);
      showToast('✅ Адрес склада подтверждён', 'success');
    } else {
      setToCoords([coords.lat, coords.lng]);
      setToConfirmed(true);
      if (fromCoords) {
        currentMap.panTo([coords.lat, coords.lng]);
        currentMap.geoObjects.add(new ymaps.Placemark([coords.lat, coords.lng], { 
          balloonContent: '🏠 Получатель' 
        }, { preset: 'islands#redDotIcon' }));
        const multiRoute = new ymaps.multiRouter.MultiRoute({
          referencePoints: [fromCoords, [coords.lat, coords.lng]],
          params: { routingMode: 'auto' }
        });
        currentMap.geoObjects.add(multiRoute);
      } else {
        currentMap.geoObjects.add(new ymaps.Placemark([coords.lat, coords.lng], { 
          balloonContent: '🏠 Получатель' 
        }, { preset: 'islands#redDotIcon' }));
      }
      showToast('✅ Адрес получателя подтверждён', 'success');
    }
  };

  useEffect(() => {
    if (fromCoords && toCoords) {
      getRouteDistance(fromCoords, toCoords).then((route) => {
        if (route) {
          const distanceKm = route.distance / 1000;
          const minutes = route.duration / 60;
          setRouteInfo(`${route.distanceText}, ${route.durationText}`);
          const distancePrice = distanceKm * 200;
          const timePrice = minutes * 50;
          setDeliveryPrice(Math.round(500 + distancePrice + timePrice));
        }
      });
    } else {
      setDeliveryPrice(500);
      setRouteInfo('');
    }
  }, [fromCoords, toCoords]);

  useEffect(() => {
    const sum = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    setTotalProductsPrice(sum);
  }, [cart]);

  useEffect(() => {
    const base = deliveryPrice + totalProductsPrice;
    const factor = weatherInfo?.factor ?? 1.0;
    setFinalPrice(Math.round(base * factor));
  }, [deliveryPrice, totalProductsPrice, weatherInfo]);

  const addProductManually = async () => {
    setAddError('');
    const cellCode = cellCodeInput.trim();
    const sku = productSkuInput.trim();
    if (!cellCode || !sku) {
      setAddError('Введите код ячейки и код товара');
      return;
    }
    const { data: cell, error: cellError } = await supabase.from('storage_cells').select('id').eq('code', cellCode).single();
    if (cellError || !cell) {
      setAddError('Ячейка не найдена');
      return;
    }
    const { data: product, error: prodError } = await supabase.from('products').select('id, name, sku, price').eq('sku', sku).single();
    if (prodError || !product) {
      setAddError('Товар с таким штрихкодом не найден');
      return;
    }
    const { data: stock, error: stockError } = await supabase.from('stock').select('quantity').eq('cell_id', cell.id).eq('product_id', product.id).maybeSingle();
    if (stockError || !stock || stock.quantity < 1) {
      setAddError('Товар отсутствует в указанной ячейке или закончился');
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id && i.cell_code === cellCode);
      if (existing) {
        return prev.map(i => i.product_id === product.id && i.cell_code === cellCode ? { ...i, quantity: i.quantity + 1 } : i);
      } else {
        return [...prev, { product_id: product.id, product_name: product.name, cell_code: cellCode, quantity: 1, sku: product.sku, price: product.price || 0 }];
      }
    });
    setCellCodeInput('');
    setProductSkuInput('');
    showToast(`✅ Товар "${product.name}" добавлен в заказ`, 'success');
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
    showToast('Товар удалён из корзины', 'success');
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(index);
      return;
    }
    setCart(prev => prev.map((item, i) => i === index ? { ...item, quantity: newQuantity } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCoords || !toCoords) {
      showToast('Подтвердите адреса (кнопкой "Найти на карте")', 'error');
      return;
    }
    if (cart.length === 0) {
      showToast('Добавьте хотя бы один товар', 'error');
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      client_id: user.id,
      from_address: fromAddress,
      to_address: toAddress,
      from_coords: `(${fromCoords[0]},${fromCoords[1]})`,
      to_coords: `(${toCoords[0]},${toCoords[1]})`,
      weight_kg: 0,
      fragile: false,
      price: finalPrice,
      status: 'pending',
      delivery_code: Math.floor(100000 + Math.random() * 900000).toString()
    }).select('id').single();
    if (orderError) {
      showToast('Ошибка создания заказа: ' + orderError.message, 'error');
      setLoading(false);
      return;
    }
    for (const item of cart) {
      await supabase.from('order_items').insert({ 
        order_id: order.id, 
        product_id: item.product_id, 
        quantity: item.quantity, 
        picked_quantity: 0, 
        cell_code: item.cell_code 
      });
    }
    showToast(`✅ Заказ #${order.id.slice(0, 8)} успешно создан!`, 'success');
    setTimeout(() => navigate(`/track/${order.id}`), 1500);
    setLoading(false);
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

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    transition: 'all 0.2s',
    boxSizing: 'border-box' as const,
    marginBottom: '0.5rem',
  };

  const buttonStyle = {
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    transition: 'transform 0.2s',
  };

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

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
            📝
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Создание заказа
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Укажите адреса и добавьте товары для доставки
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
          {/* Форма */}
          <div>
            <form onSubmit={handleSubmit}>
              {/* Адрес склада */}
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📦 Адрес склада (откуда)
                </h3>
                <input
                  type="text"
                  placeholder="Введите адрес склада"
                  value={fromAddress}
                  onChange={e => setFromAddress(e.target.value)}
                  required
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => confirmAddress('from')}
                  style={{
                    ...buttonStyle,
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    color: 'white',
                    width: '100%',
                  }}
                >
                  🔍 Найти на карте
                </button>
                {fromConfirmed && (
                  <div style={{ marginTop: '0.5rem', color: '#10b981', fontSize: '0.85rem' }}>
                    ✅ Адрес подтверждён
                  </div>
                )}
              </div>

              {/* Адрес получателя */}
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🏠 Адрес получателя (куда)
                </h3>
                <input
                  type="text"
                  placeholder="Введите адрес получателя"
                  value={toAddress}
                  onChange={e => setToAddress(e.target.value)}
                  required
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => confirmAddress('to')}
                  style={{
                    ...buttonStyle,
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    color: 'white',
                    width: '100%',
                  }}
                >
                  🔍 Найти на карте
                </button>
                {toConfirmed && (
                  <div style={{ marginTop: '0.5rem', color: '#10b981', fontSize: '0.85rem' }}>
                    ✅ Адрес подтверждён
                  </div>
                )}
              </div>

              {/* Добавление товара */}
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ➕ Добавить товар по штрихкоду
                </h3>
                <input
                  type="text"
                  placeholder="Код ячейки (например, A-12-3)"
                  value={cellCodeInput}
                  onChange={e => setCellCodeInput(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Код товара (SKU, например, PR001)"
                  value={productSkuInput}
                  onChange={e => setProductSkuInput(e.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={addProductManually}
                  style={{
                    ...buttonStyle,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    width: '100%',
                  }}
                >
                  ➕ Добавить товар
                </button>
                {addError && (
                  <div style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.85rem' }}>
                    ❌ {addError}
                  </div>
                )}
              </div>

              {/* Корзина */}
              {cart.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🛒 Товары в заказе ({cart.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {cart.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                          borderRadius: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>SKU: {item.sku}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Ячейка: {item.cell_code}</div>
                            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                              {item.price} ₸ × 
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                                style={{
                                  width: '60px',
                                  marginLeft: '0.5rem',
                                  padding: '0.25rem',
                                  borderRadius: '0.5rem',
                                  border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                                  background: theme === 'dark' ? '#1e293b' : '#ffffff',
                                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                                }}
                              />
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: '#4f46e5' }}>
                              {(item.price * item.quantity).toLocaleString()} ₸
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromCart(idx)}
                              style={{
                                marginTop: '0.5rem',
                                background: '#ef4444',
                                border: 'none',
                                borderRadius: '0.5rem',
                                padding: '0.25rem 0.5rem',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              🗑️ Удалить
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Информация о доставке */}
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🚚 Информация о доставке
                </h3>
                {routeInfo && (
                  <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.75rem', marginBottom: '0.75rem' }}>
                    🚗 Расстояние: {routeInfo}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Доставка:</span>
                  <span style={{ fontWeight: 600 }}>{deliveryPrice.toLocaleString()} ₸</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Товары:</span>
                  <span style={{ fontWeight: 600 }}>{totalProductsPrice.toLocaleString()} ₸</span>
                </div>
                
                {/* Погода */}
                {weatherInfo && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: weatherInfo.factor !== 1.0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {weatherInfo.icon && <img src={`https://openweathermap.org/img/w/${weatherInfo.icon}.png`} alt="погода" />}
                      <div>
                        <strong>Погода на складе:</strong> {weatherInfo.description}, {Math.round(weatherInfo.temperature)}°C
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                      💨 Ветер {weatherInfo.windSpeed} м/с, 💧 Влажность {weatherInfo.humidity}%
                    </div>
                    {weatherInfo.factor !== 1.0 ? (
                      <div style={{ marginTop: '0.5rem', color: '#f59e0b', fontSize: '0.85rem' }}>
                        ⚠️ Погодный коэффициент {weatherInfo.factor.toFixed(2)} (стоимость увеличена)
                      </div>
                    ) : (
                      <div style={{ marginTop: '0.5rem', color: '#10b981', fontSize: '0.85rem' }}>
                        ✅ Погода благоприятная, коэффициент не применяется
                      </div>
                    )}
                  </div>
                )}

                {/* Итого */}
                <div style={{
                  marginTop: '1rem',
                  paddingTop: '1rem',
                  borderTop: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>💰 Итого к оплате:</span>
                    <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#4f46e5' }}>
                      {finalPrice.toLocaleString()} ₸
                    </span>
                  </div>
                  {weatherInfo && weatherInfo.factor !== 1.0 && (
                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
                      (с учётом погодного коэффициента {weatherInfo.factor.toFixed(2)})
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    width: '100%',
                    marginTop: '1rem',
                    fontSize: '1rem',
                    padding: '1rem',
                  }}
                >
                  {loading ? '⏳ Создание заказа...' : '✅ Оформить заказ'}
                </button>
              </div>
            </form>
          </div>

          {/* Карта */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🗺️ Карта маршрута
            </h3>
            <div id="create-order-map" style={{ width: '100%', height: '450px', borderRadius: '1rem', overflow: 'hidden' }}></div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.7, textAlign: 'center' }}>
              📍 Зелёная метка — склад, 🔴 Красная — получатель, 🚚 Синяя — маршрут
            </div>
          </div>
        </div>
      </div>

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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}