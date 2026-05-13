import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface Container {
  id: string;
  container_number: string;
  size_category: string;
  status: string;
  is_loaded: boolean;
  owner: string;
  counterparty: string;
  driver_name: string;
  vehicle_plate: string;
  created_at: string;
  placed_zone?: { name: string };
  placed_by?: { full_name: string };
  placed_at?: string;
}

export default function Containers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    container_number: '',
    size_category: '20',
    is_loaded: true,
    owner: '',
    counterparty: '',
    driver_name: '',
    vehicle_plate: '',
  });
  const [loading, setLoading] = useState(false);

  const loadContainers = async () => {
    const { data } = await supabase
      .from('containers')
      .select(`
        *,
        placed_zone:placed_zone_id ( name ),
        placed_by:placed_by ( full_name )
      `)
      .order('created_at', { ascending: false });
    if (data) setContainers(data);
  };

  useEffect(() => {
    loadContainers();
  }, []);

  const createContainer = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('containers')
      .insert({
        ...formData,
        created_by: user?.id,
        status: 'awaiting',
      })
      .select()
      .single();
    if (error) alert('Ошибка: ' + error.message);
    else {
      alert(`Контейнер ${data.container_number} создан`);
      setShowForm(false);
      setFormData({
        container_number: '',
        size_category: '20',
        is_loaded: true,
        owner: '',
        counterparty: '',
        driver_name: '',
        vehicle_plate: '',
      });
      loadContainers();
    }
    setLoading(false);
  };

  const issuePass = async (containerId: string, containerNumber: string) => {
    const passNumber = `PASS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { error } = await supabase
      .from('passes')
      .insert({ container_id: containerId, pass_number: passNumber });
    if (error) alert('Ошибка выписки пропуска: ' + error.message);
    else {
      alert(`Пропуск ${passNumber} для контейнера ${containerNumber} выписан`);
      // Обновляем список контейнеров
      loadContainers();
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'awaiting': return '⏳ Ожидает размещения';
      case 'placed': return '✅ Размещён крановщиком';
      case 'departed': return '🚛 Выехал';
      default: return status;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Управление контейнерами</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">➕ Добавить контейнер</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={{ padding: 10 }}>№ контейнера</th><th>Размер</th><th>Груженый</th><th>Собственник</th><th>Контрагент</th><th>Водитель</th><th>Авто</th><th>Статус</th><th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {containers.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}><strong>{c.container_number}</strong></td>
                <td>{c.size_category}'</td>
                <td>{c.is_loaded ? 'Груженый' : 'Порожний'}</td>
                <td>{c.owner}</td>
                <td>{c.counterparty || '—'}</td>
                <td>{c.driver_name || '—'}</td>
                <td>{c.vehicle_plate || '—'}</td>
                <td>{getStatusLabel(c.status)}</td>
                <td>
                  {c.status === 'awaiting' && (
                    <button onClick={() => issuePass(c.id, c.container_number)} className="btn-secondary" style={{ padding: '4px 8px' }}>🎫 Выписать пропуск</button>
                  )}
                  {c.status === 'placed' && <span style={{ color: 'green' }}>✓ Размещён</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {containers.length === 0 && <p>Нет контейнеров</p>}
      </div>

      {/* Модальное окно добавления контейнера */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ maxWidth: 500, width: '90%' }}>
            <h3>Новый контейнер</h3>
            <input type="text" placeholder="Номер контейнера *" value={formData.container_number} onChange={e => setFormData({ ...formData, container_number: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <select value={formData.size_category} onChange={e => setFormData({ ...formData, size_category: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
              <option value="20">20 футов</option>
              <option value="40">40 футов</option>
              <option value="45">45 футов</option>
            </select>
            <select value={formData.is_loaded ? 'loaded' : 'empty'} onChange={e => setFormData({ ...formData, is_loaded: e.target.value === 'loaded' })} style={{ width: '100%', marginBottom: 10 }}>
              <option value="loaded">Груженый</option>
              <option value="empty">Порожний</option>
            </select>
            <input type="text" placeholder="Собственник *" value={formData.owner} onChange={e => setFormData({ ...formData, owner: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <input type="text" placeholder="Контрагент (опционально)" value={formData.counterparty} onChange={e => setFormData({ ...formData, counterparty: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <input type="text" placeholder="ФИО водителя" value={formData.driver_name} onChange={e => setFormData({ ...formData, driver_name: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <input type="text" placeholder="Госномер авто" value={formData.vehicle_plate} onChange={e => setFormData({ ...formData, vehicle_plate: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={createContainer} disabled={loading} className="btn-primary">Сохранить</button>
              <button onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}