import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

interface WorkerStats {
  id: string;
  full_name: string;
  role: string;
  rating: number;
  total_deliveries: number;
  total_earnings: number;
  salary: number;
  efficiency: number;
  current_load: number;
}

interface AIAnalysis {
  bestCourier: string;
  bestCourierRating: string;
  worstCollector: string;
  worstCollectorRating: string;
  avgCourierRating: string;
  avgCollectorRating: string;
  recommendations: string;
}

export default function Analytics() {
  const [workers, setWorkers] = useState<WorkerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [salaryReport, setSalaryReport] = useState<any>(null);
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
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, rating, total_deliveries, total_earnings, salary, efficiency, current_load')
      .in('role', ['courier', 'collector'])
      .order('rating', { ascending: false });
    if (error) {
      showToast('Ошибка загрузки данных: ' + error.message, 'error');
    }
    if (data) setWorkers(data);
    generateAIAnalysis(data || []);
    generateSalaryReport(data || []);
    setLoading(false);
  };

  const generateAIAnalysis = (workersData: WorkerStats[]) => {
    const couriers = workersData.filter(w => w.role === 'courier');
    const collectors = workersData.filter(w => w.role === 'collector');
    
    const bestCourier = couriers.sort((a, b) => b.rating - a.rating)[0];
    const worstCollector = collectors.sort((a, b) => a.rating - b.rating)[0];
    const avgCourierRating = couriers.reduce((sum, w) => sum + (w.rating || 0), 0) / (couriers.length || 1);
    const avgCollectorRating = collectors.reduce((sum, w) => sum + (w.rating || 0), 0) / (collectors.length || 1);
    
    let recommendations = '';
    if (avgCourierRating < 3.5) recommendations += '• 📚 Рекомендуется провести тренинг для курьеров\n';
    if (avgCollectorRating < 3.5) recommendations += '• 📦 Низкий рейтинг сборщиков, нужна мотивация\n';
    if (workersData.some(w => w.efficiency < 50)) recommendations += '• ⚠️ Есть сотрудники с низкой эффективностью (<50%)\n';
    if (!recommendations) recommendations += '• ✅ В целом хорошие показатели, поддерживайте уровень\n';
    
    setAiAnalysis({
      bestCourier: bestCourier?.full_name || 'нет данных',
      bestCourierRating: bestCourier?.rating ? bestCourier.rating.toFixed(1) : '0',
      worstCollector: worstCollector?.full_name || 'нет данных',
      worstCollectorRating: worstCollector?.rating ? worstCollector.rating.toFixed(1) : '0',
      avgCourierRating: avgCourierRating.toFixed(1),
      avgCollectorRating: avgCollectorRating.toFixed(1),
      recommendations
    });
  };

  const generateSalaryReport = (workersData: WorkerStats[]) => {
    const couriers = workersData.filter(w => w.role === 'courier');
    const collectors = workersData.filter(w => w.role === 'collector');
    setSalaryReport({
      totalCourierSalary: couriers.reduce((sum, w) => sum + (w.salary || 0), 0),
      totalCollectorSalary: collectors.reduce((sum, w) => sum + (w.salary || 0), 0),
      avgCourierEfficiency: couriers.reduce((sum, w) => sum + (w.efficiency || 0), 0) / (couriers.length || 1),
      avgCollectorEfficiency: collectors.reduce((sum, w) => sum + (w.efficiency || 0), 0) / (collectors.length || 1),
      totalPayroll: couriers.reduce((sum, w) => sum + (w.salary || 0), 0) + collectors.reduce((sum, w) => sum + (w.salary || 0), 0),
    });
  };

  const ratingData = workers.map(w => ({ 
    name: w.full_name?.split(' ')[0] || w.id.slice(0, 6), 
    rating: w.rating || 0,
    role: w.role === 'courier' ? 'Курьер' : 'Сборщик'
  }));
  
  const deliveriesData = workers
    .filter(w => w.role === 'courier')
    .map(w => ({ 
      name: w.full_name?.split(' ')[0] || w.id.slice(0, 6), 
      deliveries: w.total_deliveries || 0 
    }));
  
  const loadDataForPie = [
    { name: 'Курьеры', value: workers.filter(w => w.role === 'courier').length },
    { name: 'Сборщики', value: workers.filter(w => w.role === 'collector').length },
  ];
  
  const COLORS = ['#4f46e5', '#10b981'];

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

  if (loading) {
    return (
      <div style={bgStyle}>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '3rem' }}>🌀</span>
          <p style={{ marginTop: '1rem', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            Загрузка аналитики...
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
            📊
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Аналитика и метрики
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            Статистика работы сотрудников и финансовые показатели
          </p>
        </div>

        {/* Графики */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Рейтинг сотрудников */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⭐ Рейтинг сотрудников
            </h3>
            {ratingData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ratingData}>
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
                Нет данных о рейтинге
              </div>
            )}
          </div>

          {/* Доставки по курьерам */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📦 Доставки по курьерам
            </h3>
            {deliveriesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deliveriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" stroke={theme === 'dark' ? '#94a3b8' : '#475569'} />
                  <YAxis stroke={theme === 'dark' ? '#94a3b8' : '#475569'} />
                  <Tooltip 
                    contentStyle={{ 
                      background: theme === 'dark' ? '#1e293b' : '#ffffff',
                      border: 'none',
                      borderRadius: '0.5rem'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="deliveries" fill="#82ca9d" name="Количество доставок" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                Нет данных о доставках
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Состав команды */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              👥 Состав команды
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={loadDataForPie}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {loadDataForPie.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    background: theme === 'dark' ? '#1e293b' : '#ffffff',
                    border: 'none',
                    borderRadius: '0.5rem'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                <span style={{ width: '12px', height: '12px', background: '#4f46e5', borderRadius: '50%' }}></span>
                Курьеры: {loadDataForPie[0].value}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '50%' }}></span>
                Сборщики: {loadDataForPie[1].value}
              </span>
            </div>
          </div>

          {/* AI-анализ */}
          <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(139, 92, 246, 0.1))' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🤖 AI-анализ эффективности
            </h3>
            {aiAnalysis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>⭐ Лучший курьер</div>
                  <div>{aiAnalysis.bestCourier} (рейтинг {aiAnalysis.bestCourierRating})</div>
                </div>
                <div style={{ padding: '0.75rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>⚠️ Отстающий сборщик</div>
                  <div>{aiAnalysis.worstCollector} (рейтинг {aiAnalysis.worstCollectorRating})</div>
                </div>
                <div style={{ padding: '0.75rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>📊 Средний рейтинг</div>
                  <div>Курьеры: {aiAnalysis.avgCourierRating} | Сборщики: {aiAnalysis.avgCollectorRating}</div>
                </div>
                <div style={{ padding: '0.75rem', background: theme === 'dark' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)', borderRadius: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>💡 Рекомендации</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{aiAnalysis.recommendations}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Финансовый отчёт */}
        {salaryReport && (
          <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              💰 Финансовый отчёт
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Общая зарплата курьеров</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4f46e5' }}>
                  {salaryReport.totalCourierSalary.toLocaleString()} ₸
                </div>
              </div>
              <div style={{ padding: '1rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Общая зарплата сборщиков</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                  {salaryReport.totalCollectorSalary.toLocaleString()} ₸
                </div>
              </div>
              <div style={{ padding: '1rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Средняя эффективность курьеров</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                  {salaryReport.avgCourierEfficiency.toFixed(1)}%
                </div>
              </div>
              <div style={{ padding: '1rem', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Средняя эффективность сборщиков</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                  {salaryReport.avgCollectorEfficiency.toFixed(1)}%
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '0.75rem', color: 'white' }}>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Общий фонд оплаты труда</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                {salaryReport.totalPayroll.toLocaleString()} ₸
              </div>
            </div>
          </div>
        )}

        {/* Список сотрудников */}
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📋 Список сотрудников
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  background: theme === 'dark' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)',
                  borderBottom: theme === 'dark' ? '2px solid #4f46e5' : '2px solid #4f46e5',
                }}>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Имя</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Роль</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Рейтинг</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Доставок/Сборок</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Зарплата</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Эффективность</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'left' }}>Загрузка</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, index) => (
                  <tr
                    key={w.id}
                    style={{
                      borderBottom: index === workers.length - 1 ? 'none' : `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
                      animation: 'fadeInUp 0.3s ease-out',
                      animationDelay: `${index * 0.02}s`,
                      animationFillMode: 'both',
                    }}
                  >
                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>{w.full_name || w.id.slice(0, 8)}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        background: w.role === 'courier' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(79, 70, 229, 0.2)',
                        color: w.role === 'courier' ? '#10b981' : '#4f46e5',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.8rem',
                      }}>
                        {w.role === 'courier' ? '🚚 Курьер' : '📦 Сборщик'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        color: (w.rating || 0) >= 4 ? '#10b981' : (w.rating || 0) >= 3 ? '#f59e0b' : '#ef4444',
                        fontWeight: 600,
                      }}>
                        ⭐ {w.rating?.toFixed(1) || '0'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>{w.total_deliveries || 0}</td>
                    <td style={{ padding: '0.75rem' }}>{(w.salary || 0).toLocaleString()} ₸</td>
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
                            width: `${w.efficiency || 0}%`,
                            height: '100%',
                            background: (w.efficiency || 0) >= 70 ? '#10b981' : (w.efficiency || 0) >= 50 ? '#f59e0b' : '#ef4444',
                            borderRadius: '3px',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.85rem' }}>{(w.efficiency || 0).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{(w.current_load || 0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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