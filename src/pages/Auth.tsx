import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../context/ThemeContext';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!isLogin) {
      if (password.length < 6) {
        showToast('Пароль должен быть не менее 6 символов', 'error');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        showToast('Пароли не совпадают', 'error');
        setLoading(false);
        return;
      }
      if (!fullName.trim()) {
        showToast('Введите ваше имя', 'error');
        setLoading(false);
        return;
      }
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showToast(error.message, 'error');
      else showToast('Добро пожаловать!', 'success');
    } else {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });

      if (error) {
        showToast(error.message, 'error');
      } else if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          role: 'client',
          full_name: fullName.trim(),
          email: email,
        });
        if (profileError) {
          console.error('Profile error:', profileError);
          showToast('Регистрация прошла, но профиль не создан. Обратитесь к админу.', 'error');
        } else {
          showToast('Регистрация успешна! Теперь войдите.', 'success');
          setIsLogin(true);
          setFullName('');
          setPassword('');
          setConfirmPassword('');
        }
      }
    }
    setLoading(false);
  };

  // Инлайн-стили в зависимости от темы
  const bgStyle = {
    minHeight: '100vh',
    background: theme === 'dark'
      ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)'
      : 'linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    position: 'relative' as const,
    transition: 'background 0.3s ease',
  };

  const cardStyle = {
    maxWidth: '440px',
    width: '100%',
    background: theme === 'dark'
      ? 'rgba(30, 41, 59, 0.9)'
      : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(10px)',
    borderRadius: '2rem',
    padding: '2rem',
    boxShadow: theme === 'dark'
      ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
    transition: 'all 0.3s ease',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.85rem 1rem 0.85rem 2.8rem',
    fontSize: '1rem',
    borderRadius: '1rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    transition: 'all 0.2s',
  };

  const buttonPrimaryStyle = {
    width: '100%',
    padding: '0.85rem',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '1rem',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: 'white',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  };

  const iconStyle = {
    position: 'absolute' as const,
    left: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '1.2rem',
    opacity: 0.6,
  };

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

      {/* Карточка */}
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
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
            {isLogin ? '🔐' : '✨'}
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            {isLogin ? 'С возвращением' : 'Создать аккаунт'}
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            {isLogin ? 'Войдите в свой аккаунт' : 'Заполните данные для регистрации'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Email */}
          <div style={{ position: 'relative' }}>
            <span style={iconStyle}>📧</span>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
              onBlur={e => e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e2e8f0'}
            />
          </div>

          {/* Full name (только регистрация) */}
          {!isLogin && (
            <div style={{ position: 'relative', animation: 'slideDown 0.2s ease-out' }}>
              <span style={iconStyle}>👤</span>
              <input
                type="text"
                placeholder="Как вас зовут?"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
                onBlur={e => e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e2e8f0'}
              />
            </div>
          )}

          {/* Пароль */}
          <div style={{ position: 'relative' }}>
            <span style={iconStyle}>🔒</span>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
              onBlur={e => e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e2e8f0'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                opacity: 0.6,
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {/* Подтверждение пароля (регистрация) */}
          {!isLogin && (
            <div style={{ position: 'relative', animation: 'slideDown 0.2s ease-out' }}>
              <span style={iconStyle}>🔐</span>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Подтвердите пароль"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
                onBlur={e => e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e2e8f0'}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  opacity: 0.6,
                }}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </button>
            </div>
          )}

          {/* Кнопка отправки */}
          <button
            type="submit"
            disabled={loading}
            style={buttonPrimaryStyle}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {loading ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>🌀</span>
                {isLogin ? 'Вход...' : 'Регистрация...'}
              </>
            ) : (
              <>
                {isLogin ? 'Войти' : 'Создать аккаунт'}
              </>
            )}
          </button>

          {/* Переключение режима */}
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setFullName('');
                setConfirmPassword('');
                setPassword('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#4f46e5',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textDecoration: 'underline',
                opacity: 0.8,
              }}
            >
              {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: theme === 'dark' ? '#64748b' : '#94a3b8' }}>
          Безопасный вход
        </div>
      </div>

      {/* Добавляем анимации в head (один раз, можно вынести в глобальный CSS) */}
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
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
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