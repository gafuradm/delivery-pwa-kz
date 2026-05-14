import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>({ full_name: '', phone: '', avatar_url: '', vehicle_type: 'small' });
  const [role, setRole] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { 
        navigate('/'); 
        return; 
      }
      setUser(user);
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) {
        console.error('Error fetching profile:', error);
        showToast('Ошибка загрузки профиля', 'error');
      }
      if (data) {
        setProfile(data);
        setRole(data.role);
      }
    };
    fetchUser();
  }, [navigate]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const updateData: any = {
      full_name: profile.full_name,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
    };
    if (role === 'courier') {
      updateData.vehicle_type = profile.vehicle_type;
    }
    
    const { error } = await supabase.from('profiles').update(updateData).eq('id', user.id);
    if (error) {
      showToast('Ошибка: ' + error.message, 'error');
    } else {
      showToast('✅ Профиль успешно обновлён!', 'success');
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Валидация типа файла
    if (!file.type.startsWith('image/')) {
      showToast('Пожалуйста, загрузите изображение', 'error');
      return;
    }
    
    // Валидация размера (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Файл не должен превышать 5MB', 'error');
      return;
    }
    
    setUploading(true);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}_${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
    if (uploadError) { 
      showToast('Ошибка загрузки: ' + uploadError.message, 'error');
      setUploading(false); 
      return; 
    }
    
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const avatar_url = urlData.publicUrl;
    
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url }).eq('id', user.id);
    if (updateError) {
      showToast('Ошибка обновления: ' + updateError.message, 'error');
    } else {
      setProfile({ ...profile, avatar_url });
      showToast('🖼️ Аватар обновлён!', 'success');
    }
    setUploading(false);
  };

  const bgStyle = {
    minHeight: '100vh',
    background: theme === 'dark'
      ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)'
      : 'linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%)',
    padding: '2rem 1rem',
    transition: 'background 0.3s ease',
  };

  const cardStyle = {
    maxWidth: '700px',
    margin: '0 auto',
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
    boxSizing: 'border-box' as const,
  };

  const selectStyle = {
    width: '100%',
    padding: '0.85rem 1rem 0.85rem 2.8rem',
    fontSize: '1rem',
    borderRadius: '1rem',
    border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    background: theme === 'dark' ? '#1e293b' : '#ffffff',
    color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    outline: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
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

      <div style={cardStyle}>
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
            👤
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
            Мой профиль
          </h2>
          <p style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', marginTop: '0.5rem' }}>
            {role === 'courier' ? '🚚 Курьер' : '👤 Клиент'}
          </p>
        </div>

        {/* Аватар */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img 
              src={profile.avatar_url || 'https://via.placeholder.com/120'} 
              alt="Аватар" 
              style={{ 
                width: 120, 
                height: 120, 
                borderRadius: '50%', 
                objectFit: 'cover',
                border: `3px solid ${theme === 'dark' ? '#4f46e5' : '#7c3aed'}`,
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
              }} 
            />
            <label style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              borderRadius: '50%',
              width: '2.5rem',
              height: '2.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              transition: 'transform 0.2s',
            }}>
              <span style={{ fontSize: '1.2rem' }}>📷</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleAvatarUpload} 
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          {uploading && (
            <div style={{ marginTop: '0.5rem', color: '#4f46e5', fontSize: '0.9rem' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>🌀</span> Загрузка...
            </div>
          )}
        </div>

        <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Полное имя */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '1.2rem',
              opacity: 0.6,
            }}>👤</span>
            <input
              type="text"
              placeholder="Полное имя"
              value={profile.full_name || ''}
              onChange={e => setProfile({ ...profile, full_name: e.target.value })}
              style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
              onBlur={e => e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e2e8f0'}
            />
          </div>

          {/* Телефон */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '1.2rem',
              opacity: 0.6,
            }}>📱</span>
            <input
              type="tel"
              placeholder="Телефон"
              value={profile.phone || ''}
              onChange={e => setProfile({ ...profile, phone: e.target.value })}
              style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
              onBlur={e => e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e2e8f0'}
            />
          </div>

          {/* Email (только для чтения) */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '1.2rem',
              opacity: 0.6,
            }}>📧</span>
            <input
              type="email"
              placeholder="Email"
              value={user?.email || ''}
              disabled
              style={{
                ...inputStyle,
                opacity: 0.7,
                cursor: 'not-allowed',
                background: theme === 'dark' ? '#0f172a' : '#f1f5f9',
              }}
            />
          </div>
          
          {/* Тип транспорта для курьера */}
          {role === 'courier' && (
            <div style={{ position: 'relative', animation: 'fadeInUp 0.3s ease-out' }}>
              <span style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1.2rem',
                opacity: 0.6,
                zIndex: 1,
              }}>{profile.vehicle_type === 'large' ? '🚛' : '🚗'}</span>
              <select 
                value={profile.vehicle_type || 'small'} 
                onChange={e => setProfile({ ...profile, vehicle_type: e.target.value })}
                style={selectStyle}
              >
                <option value="small">🚗 Маленькая машина (до 50 кг, обычные товары)</option>
                <option value="large">🚛 Большегрузная машина (от 50 кг или крупногабарит)</option>
              </select>
            </div>
          )}
          
          {/* Кнопка сохранения */}
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
                Сохранение...
              </>
            ) : (
              <>
                💾 Сохранить изменения
              </>
            )}
          </button>

          {/* Кнопка выхода */}
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/');
            }}
            style={{
              width: '100%',
              padding: '0.85rem',
              fontSize: '1rem',
              fontWeight: 500,
              border: theme === 'dark' ? '1px solid #ef4444' : '1px solid #fca5a5',
              borderRadius: '1rem',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginTop: '0.5rem',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#ef4444';
            }}
          >
            🚪 Выйти из аккаунта
          </button>
        </form>

        {/* Декоративная линия */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: theme === 'dark' ? '#64748b' : '#94a3b8' }}>
          {role === 'courier' ? 'Ваш транспорт влияет на доступные заказы' : 'Заполните профиль для лучшего сервиса'}
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