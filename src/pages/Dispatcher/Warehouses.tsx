import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

interface Warehouse {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
}

interface WarehouseStock {
  id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  qr_code: string;
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [newStock, setNewStock] = useState({ product_id: '', quantity: 1 });
  const [newWarehouse, setNewWarehouse] = useState({ name: '', address: '', city: '', phone: '' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadWarehouses = async () => {
    const { data, error } = await supabase.from('warehouses').select('*').order('name');
    if (error) showToast('Ошибка загрузки складов: ' + error.message, 'error');
    if (data) setWarehouses(data);
  };

  const loadStock = async (warehouseId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select(`
        id, quantity, qr_code,
        products ( name, sku )
      `)
      .eq('warehouse_id', warehouseId);
    if (error) showToast('Ошибка загрузки остатков: ' + error.message, 'error');
    if (data) {
      setStock(data.map((item: any) => ({
        id: item.id,
        product_name: item.products.name,
        product_sku: item.products.sku,
        quantity: item.quantity,
        qr_code: item.qr_code
      })));
    }
    setLoading(false);
  };

  const loadProducts = async () => {
    const { data, error } = await supabase.from('products').select('id, name, sku, price').order('name');
    if (error) showToast('Ошибка загрузки товаров: ' + error.message, 'error');
    if (data) setProducts(data);
  };

  useEffect(() => {
    loadWarehouses();
    loadProducts();
  }, []);

  const handleSelectWarehouse = (warehouse: Warehouse) => {
    setSelectedWarehouse(warehouse);
    loadStock(warehouse.id);
  };

  const addWarehouse = async () => {
    if (!newWarehouse.name || !newWarehouse.city) {
      showToast('Заполните название и город склада', 'error');
      return;
    }
    const { error } = await supabase.from('warehouses').insert(newWarehouse);
    if (error) showToast('Ошибка: ' + error.message, 'error');
    else {
      showToast('✅ Склад успешно добавлен!', 'success');
      setShowAddWarehouse(false);
      setNewWarehouse({ name: '', address: '', city: '', phone: '' });
      loadWarehouses();
    }
  };

  const addStock = async () => {
    if (!selectedWarehouse) return;
    if (!newStock.product_id) {
      showToast('Выберите товар', 'error');
      return;
    }
    if (newStock.quantity <= 0) {
      showToast('Количество должно быть больше 0', 'error');
      return;
    }
    setLoading(true);
    
    const { data: existing } = await supabase
      .from('warehouse_stock')
      .select('id, quantity')
      .eq('warehouse_id', selectedWarehouse.id)
      .eq('product_id', newStock.product_id)
      .maybeSingle();
    
    if (existing) {
      const { error } = await supabase
        .from('warehouse_stock')
        .update({ quantity: existing.quantity + newStock.quantity })
        .eq('id', existing.id);
      if (error) showToast('Ошибка: ' + error.message, 'error');
      else showToast('✅ Количество товара обновлено', 'success');
    } else {
      const { error } = await supabase
        .from('warehouse_stock')
        .insert({
          warehouse_id: selectedWarehouse.id,
          product_id: newStock.product_id,
          quantity: newStock.quantity
        });
      if (error) showToast('Ошибка: ' + error.message, 'error');
      else showToast('✅ Товар добавлен на склад', 'success');
    }
    setShowAddStock(false);
    setNewStock({ product_id: '', quantity: 1 });
    if (selectedWarehouse) loadStock(selectedWarehouse.id);
    setLoading(false);
  };

  const addNewProduct = async () => {
    if (!newProductName.trim()) {
      showToast('Введите название товара', 'error');
      return;
    }
    if (!selectedWarehouse) {
      showToast('Сначала выберите склад', 'error');
      return;
    }
    setCreatingProduct(true);
    
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name: newProductName,
        sku: `CUST-${Date.now()}`,
        weight_kg: 0,
        fragile: false,
        price: 0,
      })
      .select()
      .single();
      
    if (productError) {
      showToast('Ошибка создания товара: ' + productError.message, 'error');
      setCreatingProduct(false);
      return;
    }
    
    const { error: stockError } = await supabase
      .from('warehouse_stock')
      .insert({
        warehouse_id: selectedWarehouse.id,
        product_id: product.id,
        quantity: 0,
      });
      
    if (stockError) {
      showToast('Ошибка добавления товара на склад: ' + stockError.message, 'error');
      setCreatingProduct(false);
      return;
    }
    
    showToast(`✨ Товар "${newProductName}" создан! Теперь укажите количество.`, 'success');
    setShowNewProductForm(false);
    setNewProductName('');
    await loadProducts();
    if (selectedWarehouse) {
      await loadStock(selectedWarehouse.id);
    }
    setCreatingProduct(false);
  };

  const updateQuantity = async (stockId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    const { error } = await supabase
      .from('warehouse_stock')
      .update({ quantity: newQuantity })
      .eq('id', stockId);
    if (error) showToast('Ошибка: ' + error.message, 'error');
    else {
      showToast('✅ Количество обновлено', 'success');
      if (selectedWarehouse) loadStock(selectedWarehouse.id);
    }
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
    boxShadow: theme === 'dark'
      ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
    transition: 'all 0.3s ease',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    borderRadius: '0.75rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    transition: 'all 0.2s',
    boxSizing: 'border-box' as const,
  };

  const modalOverlayStyle = {
    position: 'fixed' as const,
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
    animation: 'fadeIn 0.2s ease-out',
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
          zIndex: 1002,
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
            🏭
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Управление складами
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Управляйте складами и остатками товаров
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          {/* Список складов */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📦 Склады
              </h3>
              <button
                onClick={() => setShowAddWarehouse(true)}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.5rem 1rem',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  transition: 'transform 0.2s',
                }}
              >
                ➕ Добавить
              </button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {warehouses.map(w => (
                <div
                  key={w.id}
                  onClick={() => handleSelectWarehouse(w)}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.75rem',
                    background: selectedWarehouse?.id === w.id 
                      ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' 
                      : theme === 'dark' ? '#1e293b' : '#f8fafc',
                    color: selectedWarehouse?.id === w.id ? 'white' : (theme === 'dark' ? '#f1f5f9' : '#0f172a'),
                    borderRadius: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    transform: selectedWarehouse?.id === w.id ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>🏢 {w.name}</div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    📍 {w.city}, {w.address}
                  </div>
                  {w.phone && <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>📞 {w.phone}</div>}
                </div>
              ))}
              {warehouses.length === 0 && (
                <p style={{ textAlign: 'center', color: theme === 'dark' ? '#94a3b8' : '#64748b', padding: '2rem' }}>
                  Нет складов. Добавьте первый!
                </p>
              )}
            </div>
          </div>

          {/* Товары на выбранном складе */}
          <div style={cardStyle}>
            {selectedWarehouse ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🏭 {selectedWarehouse.name} – остатки
                  </h3>
                  <button
                    onClick={() => setShowAddStock(true)}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: '0.75rem',
                      padding: '0.5rem 1rem',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      transition: 'transform 0.2s',
                    }}
                  >
                    ➕ Добавить товар
                  </button>
                </div>
                {loading && (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '1.5rem' }}>🌀</span>
                    <p>Загрузка...</p>
                  </div>
                )}
                {stock.length === 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: '3rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
                    📭 На складе нет товаров
                    <br />
                    <button
                      onClick={() => setShowAddStock(true)}
                      style={{
                        marginTop: '1rem',
                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                        border: 'none',
                        borderRadius: '0.75rem',
                        padding: '0.5rem 1rem',
                        color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      Добавить первый товар
                    </button>
                  </div>
                )}
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {stock.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        borderBottom: index === stock.length - 1 ? 'none' : `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                        padding: '1rem 0',
                        animation: 'fadeInUp 0.3s ease-out',
                        animationDelay: `${index * 0.03}s`,
                        animationFillMode: 'both',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            📦 {item.product_name}
                            <span style={{
                              fontSize: '0.75rem',
                              background: theme === 'dark' ? '#334155' : '#e2e8f0',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '0.5rem',
                            }}>SKU: {item.product_sku}</span>
                          </div>
                          {item.qr_code && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>
                              🔲 QR: {item.qr_code.slice(0, 8)}...
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                            style={{
                              width: '80px',
                              padding: '0.5rem',
                              borderRadius: '0.5rem',
                              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                              background: theme === 'dark' ? '#1e293b' : '#ffffff',
                              color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                              textAlign: 'center',
                              fontSize: '1rem',
                            }}
                          />
                          <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>шт.</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
                🏭 Выберите склад слева
                <br />
                <span style={{ fontSize: '0.9rem', marginTop: '0.5rem', display: 'block' }}>
                  чтобы увидеть остатки товаров
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно добавления склада */}
      {showAddWarehouse && (
        <div style={modalOverlayStyle} onClick={() => setShowAddWarehouse(false)}>
          <div style={{ ...cardStyle, maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>🏢 Новый склад</h3>
            <input
              type="text"
              placeholder="Название склада"
              value={newWarehouse.name}
              onChange={e => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
              style={{ ...inputStyle, marginBottom: '0.75rem' }}
            />
            <input
              type="text"
              placeholder="Город"
              value={newWarehouse.city}
              onChange={e => setNewWarehouse({ ...newWarehouse, city: e.target.value })}
              style={{ ...inputStyle, marginBottom: '0.75rem' }}
            />
            <input
              type="text"
              placeholder="Адрес"
              value={newWarehouse.address}
              onChange={e => setNewWarehouse({ ...newWarehouse, address: e.target.value })}
              style={{ ...inputStyle, marginBottom: '0.75rem' }}
            />
            <input
              type="text"
              placeholder="Телефон"
              value={newWarehouse.phone}
              onChange={e => setNewWarehouse({ ...newWarehouse, phone: e.target.value })}
              style={{ ...inputStyle, marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={addWarehouse}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                ✅ Сохранить
              </button>
              <button
                onClick={() => setShowAddWarehouse(false)}
                style={{
                  flex: 1,
                  background: theme === 'dark' ? '#334155' : '#e2e8f0',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                  cursor: 'pointer',
                }}
              >
                ❌ Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно добавления товара на склад */}
      {showAddStock && selectedWarehouse && (
        <div style={modalOverlayStyle} onClick={() => setShowAddStock(false)}>
          <div style={{ ...cardStyle, maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>📦 Добавить товар на склад</h3>
            <select
              value={newStock.product_id}
              onChange={e => setNewStock({ ...newStock, product_id: e.target.value })}
              style={{ ...inputStyle, marginBottom: '0.75rem' }}
            >
              <option value="">Выберите товар</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
            <button
              onClick={() => setShowNewProductForm(true)}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '0.75rem',
                color: 'white',
                cursor: 'pointer',
                marginBottom: '0.75rem',
              }}
            >
              ✨ Создать новый товар
            </button>
            <input
              type="number"
              placeholder="Количество"
              value={newStock.quantity}
              onChange={e => setNewStock({ ...newStock, quantity: parseInt(e.target.value) || 0 })}
              style={{ ...inputStyle, marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={addStock}
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {loading ? '⏳ Добавление...' : '✅ Добавить'}
              </button>
              <button
                onClick={() => setShowAddStock(false)}
                style={{
                  flex: 1,
                  background: theme === 'dark' ? '#334155' : '#e2e8f0',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                  cursor: 'pointer',
                }}
              >
                ❌ Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания нового товара */}
      {showNewProductForm && (
        <div style={modalOverlayStyle} onClick={() => setShowNewProductForm(false)}>
          <div style={{ ...cardStyle, maxWidth: '400px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>✨ Создать новый товар</h3>
            <input
              type="text"
              placeholder="Название товара"
              value={newProductName}
              onChange={e => setNewProductName(e.target.value)}
              style={{ ...inputStyle, marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={addNewProduct}
                disabled={creatingProduct}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {creatingProduct ? '⏳ Создание...' : '✨ Создать'}
              </button>
              <button
                onClick={() => setShowNewProductForm(false)}
                style={{
                  flex: 1,
                  background: theme === 'dark' ? '#334155' : '#e2e8f0',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                  cursor: 'pointer',
                }}
              >
                ❌ Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Анимации */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
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
            transform: translateY(10px);
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