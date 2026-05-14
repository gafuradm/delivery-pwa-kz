import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

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
  pass_issued?: boolean;
  placed_zone?: { name: string } | null;
  placed_by?: { full_name: string } | null;
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadContainers = async () => {
    const { data, error } = await supabase
      .from('containers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Ошибка загрузки:', error);
      showToast('Ошибка загрузки: ' + error.message, 'error');
    } else {
      setContainers(data || []);
      showToast(`✅ Загружено ${data?.length || 0} контейнеров`, 'success');
    }
  };

  useEffect(() => {
    loadContainers();
  }, []);

  const createContainer = async () => {
    if (!formData.container_number.trim()) {
      showToast('Введите номер контейнера', 'error');
      return;
    }
    if (!formData.owner.trim()) {
      showToast('Введите собственника', 'error');
      return;
    }
    
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Не авторизован', 'error');
      setLoading(false);
      return;
    }
    
    const { data, error } = await supabase
      .from('containers')
      .insert({
        ...formData,
        created_by: user.id,
        status: 'awaiting',
        pass_issued: false,
      })
      .select()
      .single();
      
    if (error) {
      showToast('Ошибка: ' + error.message, 'error');
    } else {
      showToast(`✨ Контейнер ${data.container_number} успешно создан!`, 'success');
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
    
    const { error: passError } = await supabase
      .from('passes')
      .insert({ container_id: containerId, pass_number: passNumber });
      
    if (passError) {
      showToast('Ошибка выписки пропуска: ' + passError.message, 'error');
      return;
    }
    
    const { error: updateError } = await supabase
      .from('containers')
      .update({ pass_issued: true })
      .eq('id', containerId);
      
    if (updateError) {
      showToast('Ошибка обновления статуса пропуска: ' + updateError.message, 'error');
    } else {
      showToast(`✅ Пропуск ${passNumber} для контейнера ${containerNumber} выписан`, 'success');
      setContainers(prev => prev.map(c => 
        c.id === containerId ? { ...c, pass_issued: true } : c
      ));
      loadContainers();
    }
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string; bg: string }> = {
      awaiting: { label: 'Ожидает размещения', color: '#f59e0b', icon: '⏳', bg: 'rgba(245, 158, 11, 0.1)' },
      placed: { label: 'Размещён крановщиком', color: '#10b981', icon: '✅', bg: 'rgba(16, 185, 129, 0.1)' },
      departed: { label: 'Выехал', color: '#3b82f6', icon: '🚛', bg: 'rgba(59, 130, 246, 0.1)' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', icon: '📦', bg: 'rgba(107, 114, 128, 0.1)' };
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
    padding: '2rem',
    boxShadow: theme === 'dark'
      ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
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
    marginBottom: '0.75rem',
  };

  const selectStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    cursor: 'pointer',
    marginBottom: '0.75rem',
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
            🚢
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Управление контейнерами
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Учёт и отслеживание контейнеров на складе
          </p>
        </div>

        {/* Основная карточка */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Всего контейнеров</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5' }}>{containers.length}</div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '0.75rem 1.5rem',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'transform 0.2s',
              }}
            >
              ➕ Добавить контейнер
            </button>
          </div>

          {containers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
              📭 Нет контейнеров
              <br />
              <button
                onClick={() => setShowForm(true)}
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
                Добавить первый контейнер
              </button>
            </div>
          )}

          {containers.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{
                    background: theme === 'dark' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)',
                    borderBottom: theme === 'dark' ? '2px solid #4f46e5' : '2px solid #4f46e5',
                  }}>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>№ контейнера</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Размер</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Тип</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Собственник</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Водитель</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Статус</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Пропуск</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c, index) => {
                    const statusInfo = getStatusInfo(c.status);
                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: index === containers.length - 1 ? 'none' : `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                          transition: 'background 0.2s',
                          animation: 'fadeInUp 0.3s ease-out',
                          animationDelay: `${index * 0.02}s`,
                          animationFillMode: 'both',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = theme === 'dark' ? 'rgba(79, 70, 229, 0.05)' : 'rgba(79, 70, 229, 0.02)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={{ padding: '1rem 0.75rem' }}>
                          <strong style={{ color: '#4f46e5' }}>{c.container_number}</strong>
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          <span style={{
                            background: theme === 'dark' ? '#334155' : '#e2e8f0',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.85rem',
                          }}>
                            {c.size_category}'
                          </span>
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          {c.is_loaded ? (
                            <span style={{ color: '#f59e0b' }}>📦 Груженый</span>
                          ) : (
                            <span style={{ color: '#6b7280' }}>📭 Порожний</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>{c.owner}</td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          {c.driver_name ? (
                            <>
                              <div style={{ fontWeight: 500 }}>{c.driver_name}</div>
                              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{c.vehicle_plate}</div>
                            </>
                          ) : (
                            <span style={{ opacity: 0.5 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
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
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          {c.pass_issued ? (
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              ✅ Выписан
                            </span>
                          ) : c.status === 'placed' ? (
                            <span style={{ color: '#10b981' }}>✓ Размещён</span>
                          ) : (
                            <span style={{ opacity: 0.5 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          {c.status === 'awaiting' && !c.pass_issued && (
                            <button
                              onClick={() => issuePass(c.id, c.container_number)}
                              style={{
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                border: 'none',
                                borderRadius: '0.5rem',
                                padding: '0.5rem 1rem',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                transition: 'transform 0.2s',
                              }}
                            >
                              🎫 Выписать пропуск
                            </button>
                          )}
                        </td>
                       </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно добавления контейнера */}
      {showForm && (
        <div style={modalOverlayStyle} onClick={() => setShowForm(false)}>
          <div style={{ ...cardStyle, maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🚢 Новый контейнер
            </h3>
            
            <input
              type="text"
              placeholder="Номер контейнера *"
              value={formData.container_number}
              onChange={e => setFormData({ ...formData, container_number: e.target.value })}
              style={inputStyle}
            />
            
            <select value={formData.size_category} onChange={e => setFormData({ ...formData, size_category: e.target.value })} style={selectStyle}>
              <option value="20">20 футов</option>
              <option value="40">40 футов</option>
              <option value="45">45 футов</option>
            </select>
            
            <select value={formData.is_loaded ? 'loaded' : 'empty'} onChange={e => setFormData({ ...formData, is_loaded: e.target.value === 'loaded' })} style={selectStyle}>
              <option value="loaded">📦 Груженый</option>
              <option value="empty">📭 Порожний</option>
            </select>
            
            <input
              type="text"
              placeholder="Собственник *"
              value={formData.owner}
              onChange={e => setFormData({ ...formData, owner: e.target.value })}
              style={inputStyle}
            />
            
            <input
              type="text"
              placeholder="Контрагент (опционально)"
              value={formData.counterparty}
              onChange={e => setFormData({ ...formData, counterparty: e.target.value })}
              style={inputStyle}
            />
            
            <input
              type="text"
              placeholder="ФИО водителя"
              value={formData.driver_name}
              onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
              style={inputStyle}
            />
            
            <input
              type="text"
              placeholder="Госномер авто"
              value={formData.vehicle_plate}
              onChange={e => setFormData({ ...formData, vehicle_plate: e.target.value })}
              style={inputStyle}
            />
            
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                onClick={createContainer}
                disabled={loading}
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
                {loading ? '⏳ Создание...' : '✅ Сохранить'}
              </button>
              <button
                onClick={() => setShowForm(false)}
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
      `}</style>
    </div>
  );
}