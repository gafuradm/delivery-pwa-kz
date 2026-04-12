import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from 'recharts';
import { Link } from 'react-router-dom';

export default function MyPerformance() {
  const [myStats, setMyStats] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiRecommendations, setAiRecommendations] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setMyStats(profile);
    // Загружаем конкурентов (такая же роль, сортировка по рейтингу)
    const { data: all } = await supabase
      .from('profiles')
      .select('full_name, rating, total_deliveries, efficiency')
      .eq('role', profile.role)
      .neq('id', user.id)
      .order('rating', { ascending: false });
    if (all) setCompetitors(all);
    // AI-рекомендации (заглушка)
    setAiRecommendations(`Ваш рейтинг ${profile.rating?.toFixed(1)}. ${profile.rating < 4.5 ? 'Рекомендуется улучшить качество обслуживания.' : 'Отлично, продолжайте в том же духе!'}`);
    setLoading(false);
  };

  if (loading) return <div className="container">Загрузка...</div>;

  const chartData = competitors.slice(0, 5).map(c => ({ name: c.full_name?.split(' ')[0] || 'Другой', rating: c.rating }));
  chartData.unshift({ name: 'Вы', rating: myStats.rating });

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Моя эффективность</h1>
        <div>
          <Link to="/" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>← Назад</Link>
          <Link to="/profile" className="btn-primary" style={{ marginRight: 10, background: '#6c757d' }}>👤 Профиль</Link>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')} className="btn-primary" style={{ background: '#dc2626' }}>Выйти</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: 'white', padding: 15, borderRadius: 10 }}>
          <h3>Ваши показатели</h3>
          <p>⭐ Рейтинг: {myStats.rating?.toFixed(1)}</p>
          <p>📦 {myStats.role === 'courier' ? 'Доставок' : 'Сборок'}: {myStats.total_deliveries || 0}</p>
          <p>💰 Зарплата: {myStats.salary || 0} ₸</p>
          <p>⚡ Эффективность: {myStats.efficiency || 0}%</p>
        </div>

        <div style={{ background: '#f0f9ff', padding: 15, borderRadius: 10 }}>
          <h3>🤖 AI-рекомендации</h3>
          <p>{aiRecommendations}</p>
        </div>
      </div>

      <div style={{ background: 'white', padding: 15, borderRadius: 10, marginTop: 20 }}>
        <h3>📊 Сравнение с конкурентами (рейтинг)</h3>
        <BarChart width={600} height={300} data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, 5]} />
          <Tooltip />
          <Legend />
          <Bar dataKey="rating" fill="#8884d8" />
        </BarChart>
      </div>

      <div style={{ background: 'white', padding: 15, borderRadius: 10, marginTop: 20, overflowX: 'auto' }}>
        <h3>🏆 Топ-5 конкурентов</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th>Имя</th><th>Рейтинг</th><th>Доставок/Сборок</th><th>Эффективность</th></tr></thead>
          <tbody>
            {competitors.slice(0,5).map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid #ddd' }}>
                <td>{c.full_name || 'Аноним'}</td>
                <td>{c.rating?.toFixed(1)}</td>
                <td>{c.total_deliveries || 0}</td>
                <td>{c.efficiency || 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}