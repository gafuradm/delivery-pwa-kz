import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../context/ThemeContext';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, email')
      .order('created_at', { ascending: false });
    if (error) {
      showToast('Ошибка загрузки: ' + error.message, 'error');
    } else {
      setUsers(data || []);
      showToast(`✅ Загружено ${data?.length || 0} пользователей`, 'success');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateRole = async (userId: string, newRole: string) => {
    setUpdating(userId);
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (error) {
      showToast('Ошибка обновления: ' + error.message, 'error');
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      const roleLabel = roleOptions.find(r => r.value === newRole)?.label || newRole;
      showToast(`✅ Роль изменена на ${roleLabel}`, 'success');
    }
    setUpdating(null);
  };

  const roleOptions = [
    { value: 'client', label: '👤 Клиент', color: '#3b82f6', icon: '👤' },
    { value: 'courier', label: '🚚 Курьер', color: '#10b981', icon: '🚚' },
    { value: 'dispatcher', label: '🖥️ Диспетчер', color: '#f59e0b', icon: '🖥️' },
    { value: 'collector', label: '📦 Сборщик', color: '#8b5cf6', icon: '📦' },
    { value: 'crane_operator', label: '🏗️ Крановщик', color: '#ef4444', icon: '🏗️' },
  ];

  const getRoleBadgeStyle = (role: string) => {
    const roleInfo = roleOptions.find(r => r.value === role);
    return {
      background: roleInfo?.color || '#6b7280',
      color: 'white',
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 500,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
    };
  };

  // Фильтрация пользователей
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

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
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    transition: 'all 0.2s',
  };

  const selectStyle = {
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    borderRadius: '0.75rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    cursor: 'pointer',
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
            👥
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Управление пользователями
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Управляйте ролями и правами доступа
          </p>
        </div>

        <div style={cardStyle}>
          {/* Панель управления */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '1rem',
            marginBottom: '2rem',
            paddingBottom: '1rem',
            borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <span style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1rem',
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="Поиск по имени, email или ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ ...inputStyle, width: '100%', paddingLeft: '2.5rem' }}
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ ...selectStyle, minWidth: '180px' }}
              >
                <option value="all">🎯 Все роли</option>
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={loadUsers}
              disabled={loading}
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
              {loading ? '⏳ Загрузка...' : '🔄 Обновить'}
            </button>
          </div>

          {/* Статистика */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
            padding: '1rem',
            background: theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
            borderRadius: '1rem',
          }}>
            <div style={{ fontSize: '0.9rem' }}>
              📊 Всего: <strong>{users.length}</strong>
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              🔍 Показано: <strong>{filteredUsers.length}</strong>
            </div>
            {roleFilter !== 'all' && (
              <div style={{ fontSize: '0.9rem' }}>
                🎯 Фильтр: <strong>{roleOptions.find(r => r.value === roleFilter)?.label}</strong>
              </div>
            )}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '2rem' }}>🌀</span>
              <p>Загрузка пользователей...</p>
            </div>
          )}

          {!loading && filteredUsers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
              {searchTerm || roleFilter !== 'all' ? (
                <>
                  🔍 Ничего не найдено
                  <br />
                  <button
                    onClick={() => { setSearchTerm(''); setRoleFilter('all'); }}
                    style={{
                      marginTop: '1rem',
                      background: 'transparent',
                      border: 'none',
                      color: '#4f46e5',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Сбросить фильтры
                  </button>
                </>
              ) : (
                <>👥 Нет пользователей</>
              )}
            </div>
          )}

          {!loading && filteredUsers.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{
                    background: theme === 'dark' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)',
                    borderBottom: theme === 'dark' ? '2px solid #4f46e5' : '2px solid #4f46e5',
                  }}>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>ID</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Имя</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Текущая роль</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Новая роль</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, index) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: index === filteredUsers.length - 1 ? 'none' : `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
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
                      <td style={{ padding: '1rem 0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {user.id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        {user.email || <span style={{ opacity: 0.5 }}>—</span>}
                      </td>
                      <td style={{ padding: '1rem 0.75rem', fontWeight: 500 }}>
                        {user.full_name || <span style={{ opacity: 0.5 }}>Не указано</span>}
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <span style={getRoleBadgeStyle(user.role)}>
                          {roleOptions.find(r => r.value === user.role)?.icon} {roleOptions.find(r => r.value === user.role)?.label || user.role}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 0.75rem' }}>
                        <select
                          defaultValue={user.role}
                          onChange={(e) => updateRole(user.id, e.target.value)}
                          disabled={updating === user.id}
                          style={{
                            ...selectStyle,
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.85rem',
                            minWidth: '160px',
                            cursor: updating === user.id ? 'wait' : 'pointer',
                            opacity: updating === user.id ? 0.6 : 1,
                          }}
                        >
                          {roleOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                        {updating === user.id && (
                          <span style={{ display: 'inline-block', animation: 'spin 0.5s linear infinite' }}>⏳</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Информационная панель */}
        <div style={{ 
          marginTop: '1.5rem',
          padding: '1rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: theme === 'dark' ? '#64748b' : '#94a3b8',
        }}>
          💡 Подсказка: Изменение роли вступает в силу немедленно
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