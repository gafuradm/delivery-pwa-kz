import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { loadYandexMaps, geocodeAddress, getRouteDistance } from '../../lib/yandexMaps';
import { getWeatherInfo, WeatherInfo } from '../../lib/weather';

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
  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const [map, setMap] = useState<any>(null);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo | null>(null);
  const [totalProductsPrice, setTotalProductsPrice] = useState(0);
  const [finalPrice, setFinalPrice] = useState(0);
  
  // Поля для ручного ввода штрихкодов
  const [cellCodeInput, setCellCodeInput] = useState('');
  const [productSkuInput, setProductSkuInput] = useState('');
  const [addError, setAddError] = useState('');

  // Загрузка карты
  useEffect(() => {
    loadYandexMaps().then((ymaps) => {
      ymapsRef.current = ymaps;
      const newMap = new ymaps.Map('map', {
        center: [43.2567, 76.9286],
        zoom: 12,
        controls: ['zoomControl', 'fullscreenControl']
      });
      newMap.controls.add('trafficControl');
      setMap(newMap);
      mapRef.current = newMap;
    }).catch(err => console.error('Ошибка загрузки карты:', err));
  }, []);

  // Геокодирование адресов
  const confirmAddress = async (type: 'from' | 'to') => {
    const address = type === 'from' ? fromAddress : toAddress;
    if (!address.trim()) {
      alert('Введите адрес');
      return;
    }
    const coords = await geocodeAddress(address);
    if (!coords) {
      alert('Адрес не найден. Попробуйте уточнить.');
      return;
    }
    if (type === 'from') {
      setFromCoords([coords.lat, coords.lng]);
      setFromConfirmed(true);
      if (map) {
        map.panTo([coords.lat, coords.lng]);
        map.geoObjects.removeAll();
        map.geoObjects.add(new ymapsRef.current.Placemark([coords.lat, coords.lng], { balloonContent: 'Склад' }));
      }
      const info = await getWeatherInfo(coords.lat, coords.lng);
      setWeatherInfo(info);
    } else {
      setToCoords([coords.lat, coords.lng]);
      setToConfirmed(true);
      if (map && fromCoords) {
        map.panTo([coords.lat, coords.lng]);
        map.geoObjects.add(new ymapsRef.current.Placemark([coords.lat, coords.lng], { balloonContent: 'Получатель' }));
        const multiRoute = new ymapsRef.current.multiRouter.MultiRoute({
          referencePoints: [fromCoords, [coords.lat, coords.lng]],
          params: { routingMode: 'auto' }
        });
        map.geoObjects.add(multiRoute);
      } else if (map && !fromCoords) {
        map.geoObjects.add(new ymapsRef.current.Placemark([coords.lat, coords.lng], { balloonContent: 'Получатель' }));
      }
    }
  };

  // Расчёт стоимости доставки
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

  // Пересчёт стоимости товаров
  useEffect(() => {
    const sum = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    setTotalProductsPrice(sum);
  }, [cart]);

  // Финальная цена
  useEffect(() => {
    const base = deliveryPrice + totalProductsPrice;
    const factor = weatherInfo?.factor ?? 1.0;
    setFinalPrice(Math.round(base * factor));
  }, [deliveryPrice, totalProductsPrice, weatherInfo]);

  // Ручное добавление товара по коду ячейки и SKU
  const addProductManually = async () => {
    setAddError('');
    const cellCode = cellCodeInput.trim();
    const sku = productSkuInput.trim();
    if (!cellCode || !sku) {
      setAddError('Введите код ячейки и код товара');
      return;
    }
    // Проверяем ячейку
    const { data: cell, error: cellError } = await supabase
      .from('storage_cells')
      .select('id')
      .eq('code', cellCode)
      .single();
    if (cellError || !cell) {
      setAddError('Ячейка не найдена');
      return;
    }
    // Проверяем товар
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('id, name, sku, price')
      .eq('sku', sku)
      .single();
    if (prodError || !product) {
      setAddError('Товар с таким штрихкодом не найден');
      return;
    }
    // Проверяем остаток в этой ячейке
    const { data: stock, error: stockError } = await supabase
      .from('stock')
      .select('quantity')
      .eq('cell_id', cell.id)
      .eq('product_id', product.id)
      .single();
    if (stockError || !stock || stock.quantity < 1) {
      setAddError('Товар отсутствует в указанной ячейке или закончился');
      return;
    }
    // Добавляем в корзину
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id && i.cell_code === cellCode);
      if (existing) {
        return prev.map(i => i.product_id === product.id && i.cell_code === cellCode ? { ...i, quantity: i.quantity + 1 } : i);
      } else {
        return [...prev, {
          product_id: product.id,
          product_name: product.name,
          cell_code: cellCode,
          quantity: 1,
          sku: product.sku,
          price: product.price || 0
        }];
      }
    });
    setCellCodeInput('');
    setProductSkuInput('');
    alert(`Товар "${product.name}" добавлен в заказ`);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCoords || !toCoords) {
      alert('Подтвердите адреса (кнопкой "Найти на карте")');
      return;
    }
    if (cart.length === 0) {
      alert('Добавьте хотя бы один товар');
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
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
      })
      .select('id')
      .single();

    if (orderError) {
      alert('Ошибка создания заказа: ' + orderError.message);
      setLoading(false);
      return;
    }

    for (const item of cart) {
      const { error: itemError } = await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        picked_quantity: 0,
        cell_code: item.cell_code
      });
      if (itemError) console.error('Ошибка добавления товара:', itemError);
    }

    alert(`Заказ #${order.id.slice(0,8)} создан!`);
    navigate(`/track/${order.id}`);
    setLoading(false);
  };

  return (
    <div className="container">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>Создать заказ на доставку</h1>
          <div>
            <Link to="/profile" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>👤 Профиль</Link>
            <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')} className="btn-primary" style={{ background: '#dc2626' }}>Выйти</button>
          </div>
        </div>
        <Link to="/my-orders" className="btn-primary" style={{background:"#6c757d"}}>📋 Мои заказы</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <form onSubmit={handleSubmit}>
          <div>
            <input type="text" placeholder="Адрес склада (откуда)" value={fromAddress} onChange={e => setFromAddress(e.target.value)} required style={{ width: '100%', padding: 10, margin: '10px 0' }} />
            <button type="button" onClick={() => confirmAddress('from')} className="btn-primary" style={{ width: '100%', marginBottom: 10, background: '#6c757d' }}>🔍 Найти на карте</button>
            {fromConfirmed && <span style={{ color: 'green' }}>✓ Адрес подтверждён</span>}
          </div>
          <div>
            <input type="text" placeholder="Адрес получателя (куда)" value={toAddress} onChange={e => setToAddress(e.target.value)} required style={{ width: '100%', padding: 10, margin: '10px 0' }} />
            <button type="button" onClick={() => confirmAddress('to')} className="btn-primary" style={{ width: '100%', marginBottom: 10, background: '#6c757d' }}>🔍 Найти на карте</button>
            {toConfirmed && <span style={{ color: 'green' }}>✓ Адрес подтверждён</span>}
          </div>
          
          <div style={{ margin: '10px 0', padding: 10, background: '#f9fafb', borderRadius: 8 }}>
            <h4>Добавить товар по штрихкоду</h4>
            <input type="text" placeholder="Код ячейки (например, A-12-3)" value={cellCodeInput} onChange={e => setCellCodeInput(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 8 }} />
            <input type="text" placeholder="Код товара (SKU, например, PR001)" value={productSkuInput} onChange={e => setProductSkuInput(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 8 }} />
            <button type="button" onClick={addProductManually} className="btn-primary" style={{ background: '#10b981' }}>➕ Добавить товар</button>
            {addError && <div style={{ color: 'red', marginTop: 8 }}>{addError}</div>}
          </div>
          
          {cart.length > 0 && (
            <div>
              <h4>Товары в заказе:</h4>
              {cart.map((item, idx) => (
                <div key={idx} style={{ background: '#f3f4f6', padding: 8, margin: 5, borderRadius: 5 }}>
                  {item.product_name} (x{item.quantity}) — {item.price}₸/шт, ячейка: {item.cell_code}
                  <button type="button" onClick={() => removeFromCart(idx)} style={{ marginLeft: 10, background: 'red', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px' }}>Удалить</button>
                </div>
              ))}
            </div>
          )}
          
          {routeInfo && <div>🚗 {routeInfo}</div>}
          <div>💰 Стоимость доставки: {deliveryPrice} ₸</div>
          <div>📦 Товары: {totalProductsPrice} ₸</div>
          
          {weatherInfo && (
            <div style={{ background: '#f0f9ff', padding: 10, borderRadius: 8, margin: '10px 0', border: '1px solid #bae6fd' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {weatherInfo.icon && <img src={`https://openweathermap.org/img/w/${weatherInfo.icon}.png`} alt="погода" />}
                <div>
                  <strong>Погода на складе:</strong> {weatherInfo.description}, {Math.round(weatherInfo.temperature)}°C<br />
                  💨 Ветер {weatherInfo.windSpeed} м/с, 💧 Влажность {weatherInfo.humidity}%
                </div>
              </div>
              {weatherInfo.factor !== 1.0 ? (
                <div style={{ color: '#ea580c' }}>⚠️ Погодный коэффициент {weatherInfo.factor.toFixed(2)} (стоимость увеличена)</div>
              ) : (
                <div style={{ color: '#16a34a' }}>✅ Погода благоприятная, коэффициент не применяется</div>
              )}
            </div>
          )}
          
          <div style={{ fontSize: 24, fontWeight: 'bold', margin: '20px 0' }}>
            💰 Итого: {finalPrice} ₸
            {weatherInfo && weatherInfo.factor !== 1.0 && <span style={{ fontSize: 14, fontWeight: 'normal' }}> (с учётом погодного коэффициента {weatherInfo.factor.toFixed(2)})</span>}
          </div>
          <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>{loading ? 'Создание...' : 'Оформить заказ'}</button>
        </form>
        <div id="map" style={{ width: '100%', height: '400px', borderRadius: 8 }}></div>
      </div>
    </div>
  );
}