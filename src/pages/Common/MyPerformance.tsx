import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

export default function MyPerformance() {
  const [myStats, setMyStats] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiRecommendations, setAiRecommendations] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setMyStats(profile);
    
    const { data: all } = await supabase
      .from('profiles')
      .select('id, full_name, rating, total_deliveries, efficiency, salary')
      .eq('role', profile.role)
      .neq('id', user.id)
      .order('rating', { ascending: false });
    if (all) setCompetitors(all);
    
    // AI-рекомендации
    let recommendations = '';
    const rating = profile.rating || 0;
    const efficiency = profile.efficiency || 0;
    
    if (rating < 3.5) {
      recommendations = '⚠️ Ваш рейтинг ниже среднего. Рекомендуется: улучшить качество обслуживания, быть пунктуальнее, вежливее общаться с клиентами.';
    } else if (rating < 4.5) {
      recommendations = '📈 Хороший результат! Для улучшения рейтинга: обращайте внимание на отзывы, старайтесь доставлять заказы быстрее.';
    } else {
      recommendations = '🏆 Отличный результат! Вы в топе. Продолжайте в том же духе, вы пример для других.';
    }
    
    if (efficiency < 50) {
      recommendations += ' ⚠️ Эффективность низкая. Попробуйте оптимизировать маршруты.';
    } else if (efficiency < 75) {
      recommendations += ' 📊 Эффективность можно повысить, планируя маршруты заранее.';
    } else {
      recommendations += ' ⚡ Отличная эффективность! Так держать.';
    }
    
    setAiRecommendations(recommendations);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'courier': return '🚚';
      case 'collector': return '📦';
      case 'dispatcher': return '🖥️';
      case 'crane_operator': return '🏗️';
      default: return '👤';
    }
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'courier': return 'Курьер';
      case 'collector': return 'Сборщик';
      case 'dispatcher': return 'Диспетчер';
      case 'crane_operator': return 'Крановщик';
      default: return role;
    }
  };

  const chartData = competitors.slice(0, 5).map(c => ({ 
    name: c.full_name?.split(' ')[0] || 'Другой', 
    rating: c.rating || 0 
  }));
  if (myStats) {
    chartData.unshift({ name: 'Вы', rating: myStats.rating || 0 });
  }

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
    textDecoration: 'none',
    display: 'inline-block',
  };

  if (loading) {
    return (
      <div style={bgStyle}>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '3rem' }}>🌀</span>
          <p style={{ marginTop: '1rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            Загрузка данных...
          </p>
        </div>
      </div>
    );
  }

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
            📈
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Моя эффективность
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Отслеживайте свои показатели и сравнивайте с коллегами
          </p>
        </div>

        {/* Навигация */}
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link
                to="/"
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                  color: 'white',
                }}
              >
                ← На главную
              </Link>
              <Link
                to="/profile"
                style={{
                  ...buttonStyle,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: 'white',
                }}
              >
                👤 Мой профиль
              </Link>
            </div>
            <button
              onClick={handleLogout}
              style={{
                ...buttonStyle,
                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: 'white',
              }}
            >
              🚪 Выйти
            </button>
          </div>
        </div>

        {/* Основные показатели */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Ваши показатели */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {getRoleIcon(myStats?.role)} Мои показатели
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}` }}>
                <span>⭐ Рейтинг</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{myStats?.rating?.toFixed(1) || '0'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}` }}>
                <span>📦 {myStats?.role === 'courier' ? 'Доставок' : 'Сборок'}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4f46e5' }}>{myStats?.total_deliveries || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}` }}>
                <span>💰 Зарплата</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{(myStats?.salary || 0).toLocaleString()} ₸</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚡ Эффективность</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '100px',
                    height: '8px',
                    background: theme === 'dark' ? '#334155' : '#e2e8f0',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${myStats?.efficiency || 0}%`,
                      height: '100%',
                      background: (myStats?.efficiency || 0) >= 70 ? '#10b981' : (myStats?.efficiency || 0) >= 50 ? '#f59e0b' : '#ef4444',
                      borderRadius: '4px',
                    }} />
                  </div>
                  <span style={{ fontWeight: 600 }}>{(myStats?.efficiency || 0).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI-рекомендации */}
          <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(139, 92, 246, 0.1))' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🤖 AI-рекомендации
            </h3>
            <div style={{ lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>{aiRecommendations}</p>
            </div>
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem', fontSize: '0.85rem' }}>
              💡 Совет: Регулярно проверяйте свою статистику и работайте над улучшением показателей
            </div>
          </div>
        </div>

        {/* График сравнения */}
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📊 Сравнение с конкурентами (рейтинг)
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#94a3b8' : '#475569'} />
                <YAxis domain={[0, 5]} stroke={theme === 'dark' ? '#94a3b8' : '#475569'} />
                <Tooltip 
                  contentStyle={{ 
                    background: theme === 'dark' ? '#1e293b' : '#ffffff',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                  }} 
                />
                <Legend />
                <Bar dataKey="rating" fill="#8884d8" name="Рейтинг" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              Нет данных для сравнения
            </div>
          )}
        </div>

        {/* Топ конкурентов */}
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🏆 Топ-5 конкурентов
          </h3>
          {competitors.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{
                    background: theme === 'dark' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)',
                    borderBottom: theme === 'dark' ? '2px solid #4f46e5' : '2px solid #4f46e5',
                  }}>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Имя</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Рейтинг</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Доставок/Сборок</th>
                    <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Эффективность</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.slice(0, 5).map((c, index) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: index === 4 ? 'none' : `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                        animation: 'fadeInUp 0.3s ease-out',
                        animationDelay: `${index * 0.05}s`,
                        animationFillMode: 'both',
                      }}
                    >
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                        {c.full_name || 'Аноним'}
                        {index === 0 && <span style={{ marginLeft: '0.5rem' }}>👑</span>}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          color: (c.rating || 0) >= 4 ? '#10b981' : (c.rating || 0) >= 3 ? '#f59e0b' : '#ef4444',
                          fontWeight: 600,
                        }}>
                          ⭐ {c.rating?.toFixed(1) || '0'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>{c.total_deliveries || 0}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            flex: 1,
                            height: '6px',
                            background: theme === 'dark' ? '#334155' : '#e2e8f0',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${c.efficiency || 0}%`,
                              height: '100%',
                              background: (c.efficiency || 0) >= 70 ? '#10b981' : (c.efficiency || 0) >= 50 ? '#f59e0b' : '#ef4444',
                              borderRadius: '3px',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.85rem' }}>{(c.efficiency || 0).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              Нет других сотрудников для сравнения
            </div>
          )}
        </div>

        {/* Информационная панель */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: theme === 'dark' ? '#64748b' : '#94a3b8' }}>
          💡 Данные обновляются автоматически при завершении заказов
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