import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

interface Container {
  id: string;
  container_number: string;
  size_category: string;
  is_loaded: boolean;
  owner: string;
}

interface Zone {
  id: string;
  name: string;
}

export default function CraneTasks() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [placingContainerId, setPlacingContainerId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    const { data: containersData, error: containersError } = await supabase
      .from('containers')
      .select('id, container_number, size_category, is_loaded, owner')
      .eq('status', 'awaiting');
    if (containersError) {
      showToast('Ошибка загрузки контейнеров: ' + containersError.message, 'error');
    }
    if (containersData) setContainers(containersData);
    
    const { data: zonesData, error: zonesError } = await supabase.from('zones').select('id, name');
    if (zonesError) {
      showToast('Ошибка загрузки зон: ' + zonesError.message, 'error');
    }
    if (zonesData) setZones(zonesData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('crane-tasks')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'containers' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const placeContainer = async (containerId: string, zoneId: string, zoneName: string) => {
    setPlacingContainerId(containerId);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Не авторизован', 'error');
      setPlacingContainerId(null);
      return;
    }
    
    const { error } = await supabase
      .from('containers')
      .update({
        status: 'placed',
        placed_by: user.id,
        placed_zone_id: zoneId,
        placed_at: new Date().toISOString(),
      })
      .eq('id', containerId);
      
    if (error) {
      showToast('Ошибка: ' + error.message, 'error');
    } else {
      await supabase.from('container_events').insert({
        container_id: containerId,
        event_type: 'placed',
        description: `Контейнер размещён крановщиком в зоне ${zoneName}`,
        created_by: user.id,
      });
      showToast(`✅ Контейнер успешно размещён в зоне "${zoneName}"!`, 'success');
      await loadData();
    }
    setPlacingContainerId(null);
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

  const buttonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '0.75rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
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
            🏗️
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Размещение контейнеров
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Выберите зону для размещения контейнера
          </p>
        </div>

        {/* Панель управления */}
        <div style={{ ...cardStyle, marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Контейнеров ожидает размещения</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5' }}>{containers.length}</div>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              style={{
                ...buttonStyle,
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: 'white',
              }}
            >
              {loading ? '⏳ Загрузка...' : '🔄 Обновить'}
            </button>
          </div>
        </div>

        {/* Список контейнеров */}
        {containers.length === 0 && !loading && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📭</div>
            <h3 style={{ marginBottom: '0.5rem', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
              Нет контейнеров для размещения
            </h3>
            <p style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
              Все контейнеры уже размещены или ожидают выписки пропуска
            </p>
          </div>
        )}

        {loading && containers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '2rem' }}>🌀</span>
            <p>Загрузка контейнеров...</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {containers.map((container, index) => (
            <div
              key={container.id}
              style={{
                ...cardStyle,
                animation: 'fadeInUp 0.3s ease-out',
                animationDelay: `${index * 0.05}s`,
                animationFillMode: 'both',
              }}
            >
              {/* Информация о контейнере */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📦</span>
                    Контейнер #{container.container_number}
                  </h3>
                  <span style={{
                    background: container.is_loaded ? 'rgba(245, 158, 11, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                    color: container.is_loaded ? '#f59e0b' : '#6b7280',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                  }}>
                    {container.is_loaded ? '📦 Груженый' : '📭 Порожний'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>Размер:</span>{' '}
                    <strong>{container.size_category}' футов</strong>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Собственник:</span>{' '}
                    <strong>{container.owner}</strong>
                  </div>
                </div>
              </div>

              {/* Зоны для размещения */}
              <div>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.7 }}>
                  🎯 Выберите зону для размещения:
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {zones.map(zone => (
                    <button
                      key={zone.id}
                      onClick={() => placeContainer(container.id, zone.id, zone.name)}
                      disabled={placingContainerId === container.id}
                      style={{
                        ...buttonStyle,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white',
                        opacity: placingContainerId === container.id ? 0.6 : 1,
                        cursor: placingContainerId === container.id ? 'wait' : 'pointer',
                      }}
                    >
                      {placingContainerId === container.id ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                          Размещение...
                        </span>
                      ) : (
                        <>
                          📍 Разместить в {zone.name}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Информационная панель о зонах */}
        {zones.length > 0 && containers.length > 0 && (
          <div style={{ ...cardStyle, marginTop: '1.5rem', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(139, 92, 246, 0.1))' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🗺️ Доступные зоны для размещения
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {zones.map(zone => (
                <div key={zone.id} style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📍</div>
                  <div style={{ fontWeight: 600 }}>{zone.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
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