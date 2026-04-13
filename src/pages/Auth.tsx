import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../context/ThemeContext';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    } else {
      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
      } else if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          role: 'client',
          full_name: email.split('@')[0]
        });
        if (profileError) console.error('Ошибка создания профиля:', profileError);
        else {
          alert('Регистрация успешна! Теперь войдите.');
          setIsLogin(true);
        }
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <button onClick={toggleTheme} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '2rem', padding: '0.5rem', cursor: 'pointer' }}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
      <div className="card" style={{ maxWidth: 400, width: '90%', margin: '1rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>{isLogin ? 'Вход' : 'Регистрация'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
        <button onClick={() => setIsLogin(!isLogin)} className="btn-outline" style={{ width: '100%', marginTop: '1rem' }}>
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}