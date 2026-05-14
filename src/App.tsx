import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { ThemeProvider } from './context/ThemeContext';
import Auth from './pages/Auth';
import CreateOrder from './pages/Client/CreateOrder';
import TrackOrder from './pages/Client/TrackOrder';
import MyOrders from './pages/Client/MyOrders';
import Tasks from './pages/Courier/Tasks';
import Dashboard from './pages/Dispatcher/Dashboard';
import Analytics from './pages/Dispatcher/Analytics';
import CollectorTasks from './pages/Collector/Tasks';
import Profile from './pages/Profile';
import Layout from './components/Layout';
import Warehouses from './pages/Dispatcher/Warehouses';
import Containers from './pages/Dispatcher/Containers';
import CraneTasks from './pages/CraneOperator/Tasks';
import Users from './pages/Dispatcher/Users';

function AppContent() {
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

  const commonRoutes = <Route path="/profile" element={<Profile />} />;

  if (role === 'client') return (
    <BrowserRouter>
      <Layout role="client" title="Создать заказ">
        <Routes>
          <Route path="/" element={<CreateOrder />} />
          <Route path="/track/:id" element={<TrackOrder />} />
          <Route path="/my-orders" element={<MyOrders />} />
          {commonRoutes}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );

  if (role === 'courier') return (
    <BrowserRouter>
      <Layout role="courier" title="Мои задания">
        <Routes>
          <Route path="/" element={<Tasks />} />
          {commonRoutes}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );

  if (role === 'dispatcher') return (
    <BrowserRouter>
      <Layout role="dispatcher" title="Диспетчерская панель">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/warehouses" element={<Warehouses />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/users" element={<Users />} />
          {commonRoutes}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );

  if (role === 'collector') return (
    <BrowserRouter>
      <Layout role="collector" title="Сборщик заказов">
        <Routes>
          <Route path="/" element={<CollectorTasks />} />
          {commonRoutes}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );

  if (role === 'crane_operator') return (
    <BrowserRouter>
      <Layout role="crane_operator" title="Размещение контейнеров">
        <Routes>
          <Route path="/" element={<CraneTasks />} />
          {commonRoutes}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );

  return <div className="container">Загрузка...</div>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}