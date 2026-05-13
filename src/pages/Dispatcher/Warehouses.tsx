import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface Warehouse {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
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
  const [products, setProducts] = useState<any[]>([]);
  const [newStock, setNewStock] = useState({ product_id: '', quantity: 1 });
  const [newWarehouse, setNewWarehouse] = useState({ name: '', address: '', city: '', phone: '' });

  // Загрузка списка складов
  const loadWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('*').order('name');
    if (data) setWarehouses(data);
  };

  // Загрузка товаров на выбранном складе
  const loadStock = async (warehouseId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('warehouse_stock')
      .select(`
        id, quantity, qr_code,
        products ( name, sku )
      `)
      .eq('warehouse_id', warehouseId);
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

  // Загрузка списка всех товаров (для добавления на склад)
  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, sku');
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
    const { error } = await supabase.from('warehouses').insert(newWarehouse);
    if (error) alert('Ошибка: ' + error.message);
    else {
      alert('Склад добавлен');
      setShowAddWarehouse(false);
      setNewWarehouse({ name: '', address: '', city: '', phone: '' });
      loadWarehouses();
    }
  };

  const addStock = async () => {
    if (!selectedWarehouse) return;
    const { error } = await supabase.from('warehouse_stock').insert({
      warehouse_id: selectedWarehouse.id,
      product_id: newStock.product_id,
      quantity: newStock.quantity
    });
    if (error) alert('Ошибка: ' + error.message);
    else {
      alert('Товар добавлен на склад');
      setShowAddStock(false);
      setNewStock({ product_id: '', quantity: 1 });
      loadStock(selectedWarehouse.id);
    }
  };

  const updateQuantity = async (stockId: string, newQuantity: number) => {
    const { error } = await supabase
      .from('warehouse_stock')
      .update({ quantity: newQuantity })
      .eq('id', stockId);
    if (error) alert('Ошибка: ' + error.message);
    else loadStock(selectedWarehouse!.id);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Управление складами</h2>
        <button onClick={() => setShowAddWarehouse(true)} className="btn-primary">➕ Добавить склад</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        {/* Список складов */}
        <div className="card">
          <h3>Склады</h3>
          {warehouses.map(w => (
            <div
              key={w.id}
              onClick={() => handleSelectWarehouse(w)}
              style={{
                padding: 10,
                marginBottom: 8,
                background: selectedWarehouse?.id === w.id ? 'var(--accent)' : 'var(--bg-secondary)',
                color: selectedWarehouse?.id === w.id ? 'white' : 'var(--text-primary)',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              <strong>{w.name}</strong>
              <br />
              <small>{w.city}, {w.address}</small>
            </div>
          ))}
          {warehouses.length === 0 && <p>Нет складов</p>}
        </div>

        {/* Товары на выбранном складе */}
        <div className="card">
          {selectedWarehouse ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{selectedWarehouse.name} – остатки</h3>
                <button onClick={() => setShowAddStock(true)} className="btn-secondary">➕ Добавить товар</button>
              </div>
              {loading && <p>Загрузка...</p>}
              {stock.length === 0 && !loading && <p>На складе нет товаров</p>}
              {stock.map(item => (
                <div key={item.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{item.product_name}</strong> (SKU: {item.product_sku})
                      <br />
                      <small>QR: {item.qr_code?.slice(0, 8)}...</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value))}
                        style={{ width: 70, textAlign: 'center' }}
                      />
                      <span>шт.</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p>Выберите склад слева</p>
          )}
        </div>
      </div>

      {/* Модальное окно добавления склада */}
      {showAddWarehouse && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ maxWidth: 500, width: '90%' }}>
            <h3>Новый склад</h3>
            <input type="text" placeholder="Название" value={newWarehouse.name} onChange={e => setNewWarehouse({ ...newWarehouse, name: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <input type="text" placeholder="Адрес" value={newWarehouse.address} onChange={e => setNewWarehouse({ ...newWarehouse, address: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <input type="text" placeholder="Город" value={newWarehouse.city} onChange={e => setNewWarehouse({ ...newWarehouse, city: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <input type="text" placeholder="Телефон" value={newWarehouse.phone} onChange={e => setNewWarehouse({ ...newWarehouse, phone: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={addWarehouse} className="btn-primary">Сохранить</button>
              <button onClick={() => setShowAddWarehouse(false)} className="btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно добавления товара на склад */}
      {showAddStock && selectedWarehouse && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ maxWidth: 500, width: '90%' }}>
            <h3>Добавить товар на склад</h3>
            <select value={newStock.product_id} onChange={e => setNewStock({ ...newStock, product_id: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">Выберите товар</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
            <input type="number" placeholder="Количество" value={newStock.quantity} onChange={e => setNewStock({ ...newStock, quantity: parseInt(e.target.value) })} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={addStock} className="btn-primary">Добавить</button>
              <button onClick={() => setShowAddStock(false)} className="btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}