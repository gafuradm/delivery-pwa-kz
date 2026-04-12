import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './pages/Auth';
import CreateOrder from './pages/Client/CreateOrder';
import TrackOrder from './pages/Client/TrackOrder';
import MyOrders from './pages/Client/MyOrders';
import Tasks from './pages/Courier/Tasks';
import Dashboard from './pages/Dispatcher/Dashboard';
import CollectorTasks from './pages/Collector/Tasks';
import Profile from './pages/Profile';
import Analytics from './pages/Dispatcher/Analytics';
import MyPerformance from './pages/Common/MyPerformance';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data }) => setRole(data?.role || 'client'));
    }
  }, [session]);

  if (!session) return <Auth />;

  // Общая обёртка для всех страниц (можно добавить навигацию, но пока оставим как есть)
  if (role === 'client') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateOrder />} />
        <Route path="/track/:id" element={<TrackOrder />} />
        <Route path="/my-orders" element={<MyOrders />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  if (role === 'courier') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Tasks />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/performance" element={<MyPerformance />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  if (role === 'dispatcher') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  if (role === 'collector') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CollectorTasks />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/performance" element={<MyPerformance />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  return <div className="container">Загрузка...</div>;
}