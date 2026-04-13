import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>({ full_name: '', phone: '', avatar_url: '' });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }
      setUser(user);
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) setProfile(data);
    };
    fetchUser();
  }, [navigate]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('profiles').update({ full_name: profile.full_name, phone: profile.phone }).eq('id', user.id);
    if (error) alert('Ошибка: ' + error.message);
    else alert('Профиль обновлён');
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}_${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
    if (uploadError) { alert('Ошибка загрузки: ' + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const avatar_url = urlData.publicUrl;
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url }).eq('id', user.id);
    if (updateError) alert('Ошибка обновления: ' + updateError.message);
    else setProfile({ ...profile, avatar_url });
    setUploading(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <img src={profile.avatar_url || 'https://via.placeholder.com/100'} alt="Аватар" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover' }} />
        <label style={{ display: 'block', margin: '10px 0' }}>
          <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
          {uploading && <span>Загрузка...</span>}
        </label>
      </div>
      <form onSubmit={handleUpdate}>
        <input type="text" placeholder="Полное имя" value={profile.full_name || ''} onChange={e => setProfile({ ...profile, full_name: e.target.value })} style={{ width: '100%', marginBottom: '1rem' }} />
        <input type="tel" placeholder="Телефон" value={profile.phone || ''} onChange={e => setProfile({ ...profile, phone: e.target.value })} style={{ width: '100%', marginBottom: '1rem' }} />
        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
      </form>
    </div>
  );
}