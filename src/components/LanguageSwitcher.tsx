import { useState } from 'react';

export default function LanguageSwitcher({ onLanguageChange }: { onLanguageChange: (lang: 'ru' | 'kk') => void }) {
  const [lang, setLang] = useState<'ru' | 'kk'>('ru');

  const toggle = () => {
    const newLang = lang === 'ru' ? 'kk' : 'ru';
    setLang(newLang);
    onLanguageChange(newLang);
  };

  return (
    <button onClick={toggle} style={{ background: '#e2e8f0', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}>
      {lang === 'ru' ? '🇰🇿 Қаз' : '🇷🇺 Рус'}
    </button>
  );
}