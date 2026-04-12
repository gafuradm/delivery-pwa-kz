import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    } else {
      // Регистрация
      const { error, data } = await supabase.auth.signUp({ 
        email, 
        password,
      });
      
      if (error) {
        alert(error.message);
      } else if (data.user) {
        // После успешной регистрации создаём профиль
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          role: 'client',
          full_name: email.split('@')[0]
        });
        
        if (profileError) {
          console.error('Ошибка создания профиля:', profileError);
          alert('Регистрация прошла, но не удалось создать профиль. Обратитесь к администратору.');
        } else {
          alert('Регистрация успешна! Теперь войдите.');
          setIsLogin(true);
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="container" style={{ maxWidth: 400, margin: '100px auto' }}>
      <h2>{isLogin ? 'Вход' : 'Регистрация'}</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: 10, margin: '10px 0' }} />
        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: 10, margin: '10px 0' }} />
        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>{loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}</button>
      </form>
      <button onClick={() => setIsLogin(!isLogin)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#2563eb' }}>
        {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
      </button>
    </div>
  );
}
