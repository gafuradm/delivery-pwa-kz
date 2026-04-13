import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

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
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, rating, total_deliveries, total_earnings, salary, efficiency, current_load')
      .in('role', ['courier', 'collector'])
      .order('rating', { ascending: false });
    if (data) setWorkers(data);
    await generateAIAnalysis(data || []);
    generateSalaryReport(data || []);
    setLoading(false);
  };

  const generateAIAnalysis = async (workersData: WorkerStats[]) => {
    const bestCourier = workersData.filter(w => w.role === 'courier').sort((a,b) => b.rating - a.rating)[0];
    const worstCollector = workersData.filter(w => w.role === 'collector').sort((a,b) => a.rating - b.rating)[0];
    setAiAnalysis(`⭐ Лучший курьер: ${bestCourier?.full_name || 'нет'} (рейтинг ${bestCourier?.rating?.toFixed(1) || 0})\n⚠️ Отстающий сборщик: ${worstCollector?.full_name || 'нет'} (рейтинг ${worstCollector?.rating?.toFixed(1) || 0})\n📈 Рекомендуется провести тренинг для отстающих и ввести бонусы за высокий рейтинг.`);
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

  const ratingData = workers.map(w => ({ name: w.full_name?.split(' ')[0] || w.id.slice(0,6), rating: w.rating }));
  const deliveriesData = workers.filter(w => w.role === 'courier').map(w => ({ name: w.full_name?.split(' ')[0] || w.id.slice(0,6), deliveries: w.total_deliveries }));
  const loadDataForPie = [
    { name: 'Курьеры', value: workers.filter(w => w.role === 'courier').length },
    { name: 'Сборщики', value: workers.filter(w => w.role === 'collector').length },
  ];
  const COLORS = ['#0088FE', '#00C49F'];

  if (loading) return <div>Загрузка аналитики...</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="card">
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
        <div className="card">
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
        <div className="card">
          <h3>👥 Состав команды</h3>
          <PieChart width={300} height={300}>
            <Pie data={loadDataForPie} cx="50%" cy="50%" labelLine={false} label={entry => entry.name} outerRadius={80} fill="#8884d8" dataKey="value">
              {loadDataForPie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>
        <div className="card" style={{ background: 'var(--bg-secondary)' }}>
          <h3>🤖 AI-анализ эффективности</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{aiAnalysis}</p>
        </div>
      </div>

      {salaryReport && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>💰 Финансовый отчёт</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <p>Общая зарплата курьеров: {salaryReport.totalCourierSalary} ₸</p>
            <p>Общая зарплата сборщиков: {salaryReport.totalCollectorSalary} ₸</p>
            <p>Средняя эффективность курьеров: {salaryReport.avgCourierEfficiency.toFixed(1)}%</p>
            <p>Средняя эффективность сборщиков: {salaryReport.avgCollectorEfficiency.toFixed(1)}%</p>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3>📋 Список сотрудников</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th>Имя</th><th>Роль</th><th>Рейтинг</th><th>Доставок/Сборок</th><th>Зарплата</th><th>Эффективность</th><th>Загрузка</th></tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <tr key={w.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem' }}>{w.full_name || w.id.slice(0,8)}</td>
                <td style={{ padding: '0.5rem' }}>{w.role === 'courier' ? 'Курьер' : 'Сборщик'}</td>
                <td style={{ padding: '0.5rem' }}>{w.rating?.toFixed(1)}</td>
                <td style={{ padding: '0.5rem' }}>{w.total_deliveries || 0}</td>
                <td style={{ padding: '0.5rem' }}>{w.salary || 0} ₸</td>
                <td style={{ padding: '0.5rem' }}>{w.efficiency || 0}%</td>
                <td style={{ padding: '0.5rem' }}>{w.current_load || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}