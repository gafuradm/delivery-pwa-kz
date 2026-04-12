import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Link } from 'react-router-dom';

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

export default function Analytics() {
  const [workers, setWorkers] = useState<WorkerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [salaryReport, setSalaryReport] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    // Загружаем всех курьеров и сборщиков
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, rating, total_deliveries, total_earnings, salary, efficiency, current_load')
      .in('role', ['courier', 'collector'])
      .order('rating', { ascending: false });
    if (data) setWorkers(data);
    
    // Генерируем AI-анализ (используем DeepSeek или локальную логику)
    await generateAIAnalysis(data || []);
    generateSalaryReport(data || []);
    setLoading(false);
  };

  const generateAIAnalysis = async (workersData: WorkerStats[]) => {
    const prompt = `Проанализируй эффективность курьеров и сборщиков на основе данных:\n${workersData.map(w => `${w.full_name} (${w.role}): рейтинг ${w.rating}, доставок ${w.total_deliveries}, эффективность ${w.efficiency}%, загрузка ${w.current_load}`).join('\n')}\nДай краткие рекомендации по улучшению работы и выдели лучших и отстающих.`;
    // Здесь можно вызвать DeepSeek API, но для демо используем заглушку
    setAiAnalysis(`⭐ Лучший курьер: ${workersData.filter(w => w.role === 'courier').sort((a,b) => b.rating - a.rating)[0]?.full_name || 'нет'}.\n⚠️ Отстающий сборщик: ${workersData.filter(w => w.role === 'collector').sort((a,b) => a.rating - b.rating)[0]?.full_name || 'нет'}.\n📈 Рекомендуется повысить мотивацию через бонусы за высокий рейтинг.`);
  };

  const generateSalaryReport = (workersData: WorkerStats[]) => {
    const couriers = workersData.filter(w => w.role === 'courier');
    const collectors = workersData.filter(w => w.role === 'collector');
    setSalaryReport({
      totalCourierSalary: couriers.reduce((sum, w) => sum + (w.salary || 0), 0),
      totalCollectorSalary: collectors.reduce((sum, w) => sum + (w.salary || 0), 0),
      avgCourierEfficiency: couriers.reduce((sum, w) => sum + (w.efficiency || 0), 0) / (couriers.length || 1),
      avgCollectorEfficiency: collectors.reduce((sum, w) => sum + (w.efficiency || 0), 0) / (collectors.length || 1),
    });
  };

  // Данные для графиков
  const ratingData = workers.map(w => ({ name: w.full_name?.split(' ')[0] || w.id.slice(0,6), rating: w.rating }));
  const deliveriesData = workers.filter(w => w.role === 'courier').map(w => ({ name: w.full_name?.split(' ')[0] || w.id.slice(0,6), deliveries: w.total_deliveries }));
  const loadDataForPie = [
    { name: 'Курьеры', value: workers.filter(w => w.role === 'courier').length },
    { name: 'Сборщики', value: workers.filter(w => w.role === 'collector').length },
  ];
  const COLORS = ['#0088FE', '#00C49F'];

  if (loading) return <div className="container">Загрузка аналитики...</div>;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Аналитика диспетчера</h1>
        <div>
          <Link to="/" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>← Назад</Link>
          <Link to="/profile" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>👤 Профиль</Link>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')} className="btn-primary" style={{ background: '#dc2626' }}>Выйти</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Рейтинг сотрудников */}
        <div style={{ background: 'white', padding: 15, borderRadius: 10 }}>
          <h3>⭐ Рейтинг сотрудников</h3>
          <BarChart width={400} height={300} data={ratingData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="rating" fill="#8884d8" />
          </BarChart>
        </div>

        {/* Количество доставок по курьерам */}
        <div style={{ background: 'white', padding: 15, borderRadius: 10 }}>
          <h3>📦 Доставки по курьерам</h3>
          <BarChart width={400} height={300} data={deliveriesData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="deliveries" fill="#82ca9d" />
          </BarChart>
        </div>

        {/* Состав команды */}
        <div style={{ background: 'white', padding: 15, borderRadius: 10 }}>
          <h3>👥 Состав команды</h3>
          <PieChart width={300} height={300}>
            <Pie data={loadDataForPie} cx="50%" cy="50%" labelLine={false} label={entry => entry.name} outerRadius={80} fill="#8884d8" dataKey="value">
              {loadDataForPie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>

        {/* AI-анализ */}
        <div style={{ background: '#f0f9ff', padding: 15, borderRadius: 10 }}>
          <h3>🤖 AI-анализ эффективности</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{aiAnalysis}</p>
        </div>
      </div>

      {/* Отчёт по зарплатам */}
      {salaryReport && (
        <div style={{ background: 'white', padding: 15, borderRadius: 10, marginTop: 20 }}>
          <h3>💰 Финансовый отчёт</h3>
          <p>Общая зарплата курьеров: {salaryReport.totalCourierSalary} ₸</p>
          <p>Общая зарплата сборщиков: {salaryReport.totalCollectorSalary} ₸</p>
          <p>Средняя эффективность курьеров: {salaryReport.avgCourierEfficiency.toFixed(1)}%</p>
          <p>Средняя эффективность сборщиков: {salaryReport.avgCollectorEfficiency.toFixed(1)}%</p>
        </div>
      )}

      {/* Таблица сотрудников */}
      <div style={{ background: 'white', padding: 15, borderRadius: 10, marginTop: 20, overflowX: 'auto' }}>
        <h3>📋 Список сотрудников</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th>Имя</th><th>Роль</th><th>Рейтинг</th><th>Доставок/Сборок</th><th>Зарплата</th><th>Эффективность</th><th>Загрузка</th></tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <tr key={w.id} style={{ borderTop: '1px solid #ddd' }}>
                <td>{w.full_name || w.id.slice(0,8)}</td>
                <td>{w.role === 'courier' ? 'Курьер' : 'Сборщик'}</td>
                <td>{w.rating?.toFixed(1)}</td>
                <td>{w.total_deliveries || 0}</td>
                <td>{w.salary || 0} ₸</td>
                <td>{w.efficiency || 0}%</td>
                <td>{w.current_load || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}