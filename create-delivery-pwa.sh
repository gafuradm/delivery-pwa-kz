#!/bin/bash
set -e
echo "🚀 Создаю проект Delivery PWA..."

# Структура папок
mkdir -p src/{pages/{Client,Courier,Dispatcher},components,lib,hooks,utils}
mkdir -p public
mkdir -p supabase/migrations

# Файлы (содержимое ниже в heredoc)
cat > package.json << 'PKG'
{
  "name": "delivery-pwa",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "firebase": "^10.7.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "react-query": "^3.39.3",
    "react-signature-canvas": "^1.0.6",
    "@tanstack/react-query": "^5.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/react-signature-canvas": "^1.0.6",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "vite-plugin-pwa": "^0.17.4",
    "workbox-window": "^7.0.0"
  }
}
PKG

cat > vite.config.ts << 'VITE'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Delivery PWA',
        short_name: 'Deliver',
        description: 'Логистическая платформа',
        theme_color: '#1E3A8A',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
});
VITE

cat > tsconfig.json << 'TS'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
TS

cat > tsconfig.node.json << 'TSN'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
TSN

cat > .env << 'ENV'
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_YANDEX_MAPS_API_KEY=your_yandex_api_key_here
VITE_FIREBASE_VAPID_KEY=your_firebase_vapid_key_here
VITE_FIREBASE_SENDER_ID=your_firebase_sender_id_here
ENV

cat > src/main.tsx << 'MAIN'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
MAIN

cat > src/index.css << 'CSS'
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; }
.container { max-width: 1280px; margin: 0 auto; padding: 1rem; }
button { cursor: pointer; transition: all 0.2s; }
.btn-primary { background: #2563eb; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: bold; }
.btn-primary:active { transform: scale(0.98); }
CSS

cat > src/App.tsx << 'APP'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './pages/Auth';
import CreateOrder from './pages/Client/CreateOrder';
import TrackOrder from './pages/Client/TrackOrder';
import Tasks from './pages/Courier/Tasks';
import Dashboard from './pages/Dispatcher/Dashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data }) => setRole(data?.role));
    }
  }, [session]);

  if (!session) return <Auth />;

  if (role === 'client') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateOrder />} />
        <Route path="/track/:id" element={<TrackOrder />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  if (role === 'courier') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Tasks />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  if (role === 'dispatcher') return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );

  return <div className="container">Загрузка...</div>;
}
APP

# Остальные файлы (я их сокращаю, но продолжу в следующем сообщении)
echo "✅ Создана базовая структура. Продолжаю запись файлов в следующем сообщении..."
