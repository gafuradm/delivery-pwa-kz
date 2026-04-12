import { useEffect, useState } from 'react';

interface VoiceAssistantProps {
  onCommand?: (command: string) => void;
  language?: 'ru' | 'kk';
  ordersCount?: number;
  rating?: number;
  todayEarnings?: number;
}

export default function VoiceAssistant({ onCommand, language = 'ru', ordersCount = 0, rating = 5, todayEarnings = 0 }: VoiceAssistantProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Распознавание речи
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Ваш браузер не поддерживает распознавание речи');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'ru' ? 'ru-RU' : 'kk-KZ';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.start();
    setListening(true);

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      processCommand(text);
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      alert('Ошибка распознавания');
    };
    recognition.onend = () => setListening(false);
  };

  // Синтез речи (озвучивание ответа)
  const speak = (text: string, lang: 'ru' | 'kk') => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'ru' ? 'ru-RU' : 'kk-KZ';
    utterance.rate = 0.9;
    setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // Обработка голосовых команд
  const processCommand = (command: string) => {
    const lower = command.toLowerCase();
    let reply = '';

    // === НАВИГАЦИЯ ===
    if (lower.includes('создать заказ') || lower.includes('жаңа тапсырыс')) {
      reply = language === 'ru' ? 'Перехожу на страницу создания заказа' : 'Жаңа тапсырыс бетіне өтемін';
      if (onCommand) onCommand('create-order');
    }
    else if (lower.includes('мои заказы') || lower.includes('менің тапсырыстарым')) {
      reply = language === 'ru' ? 'Открываю список ваших заказов' : 'Тапсырыстарыңыздың тізімін ашамын';
      if (onCommand) onCommand('my-orders');
    }
    else if (lower.includes('профиль') || lower.includes('профиль')) {
      reply = language === 'ru' ? 'Открываю профиль' : 'Профильді ашамын';
      if (onCommand) onCommand('profile');
    }
    else if (lower.includes('выйти') || lower.includes('шығу') || lower.includes('logout')) {
      reply = language === 'ru' ? 'Вы вышли из аккаунта' : 'Сіз аккаунттан шықтыңыз';
      if (onCommand) onCommand('logout');
    }
    else if (lower.includes('назад') || lower.includes('артқа') || lower.includes('вернуться')) {
      reply = language === 'ru' ? 'Возвращаюсь назад' : 'Артқа қайтамын';
      if (onCommand) onCommand('go-back');
    }
    else if (lower.includes('главная') || lower.includes('басты бет') || lower.includes('главный экран')) {
      reply = language === 'ru' ? 'Перехожу на главную' : 'Басты бетке өтемін';
      if (onCommand) onCommand('home');
    }

    // === УПРАВЛЕНИЕ ЗАКАЗАМИ (КУРЬЕР) ===
    else if (lower.includes('принять заказ') || lower.includes('тапсырысты қабылдау') || lower.includes('взять заказ')) {
      reply = language === 'ru' ? 'Принимаю первый заказ в списке' : 'Тізімдегі бірінші тапсырысты қабылдаймын';
      if (onCommand) onCommand('accept-order');
    }
    else if (lower.includes('забрал груз') || lower.includes('жүкті алдым') || lower.includes('получил груз') || lower.includes('забрал')) {
      reply = language === 'ru' ? 'Отмечаю, что груз забран' : 'Жүкті алдым деп белгілеймін';
      if (onCommand) onCommand('picked-up');
    }
    else if (lower.includes('в пути') || lower.includes('жолда') || lower.includes('поехал')) {
      reply = language === 'ru' ? 'Отмечаю, что вы в пути' : 'Жолда екеніңізді белгілеймін';
      if (onCommand) onCommand('in-transit');
    }
    else if (lower.includes('доставить') || lower.includes('жеткізу') || lower.includes('доставлен')) {
      reply = language === 'ru' ? 'Начинаю процесс доставки с фото и подписью' : 'Фото және қолтаңбамен жеткізу процесін бастаймын';
      if (onCommand) onCommand('deliver');
    }
    else if (lower.includes('открыть доставку') || lower.includes('жеткізуді ашу')) {
      reply = language === 'ru' ? 'Открываю форму доставки' : 'Жеткізу формасын ашамын';
      if (onCommand) onCommand('open-delivery');
    }
    else if (lower.includes('код') || lower.includes('коды') || lower.includes('подтверждение')) {
      reply = language === 'ru' ? 'Скажите код цифрами или введите в поле' : 'Кодты сандармен айтыңыз немесе өріске енгізіңіз';
      if (onCommand) onCommand('code-prompt');
    }

    // === ОПТИМИЗАЦИЯ МАРШРУТА ===
    else if (lower.includes('оптимизировать маршрут') || lower.includes('маршрутты оңтайландыру') || lower.includes('построить маршрут') || lower.includes('лучший путь')) {
      reply = language === 'ru' ? 'Запускаю оптимизацию маршрута' : 'Маршрутты оңтайландыруды бастаймын';
      if (onCommand) onCommand('optimize');
    }
    else if (lower.includes('показать маршрут') || lower.includes('маршрутты көрсету')) {
      reply = language === 'ru' ? 'Показываю оптимальный порядок объезда' : 'Оңтайлы айналып өту ретін көрсетемін';
      if (onCommand) onCommand('show-route');
    }

    // === НАВИГАЦИЯ ===
    else if (lower.includes('построить маршрут до склада') || lower.includes('қоймаға маршрут')) {
      reply = language === 'ru' ? 'Строю маршрут до склада' : 'Қоймаға маршрут саламын';
      if (onCommand) onCommand('navigate-to-warehouse');
    }
    else if (lower.includes('построить маршрут до клиента') || lower.includes('клиентке маршрут')) {
      reply = language === 'ru' ? 'Строю маршрут до клиента' : 'Клиентке маршрут саламын';
      if (onCommand) onCommand('navigate-to-client');
    }
    else if (lower.includes('открыть карту') || lower.includes('картаны ашу')) {
      reply = language === 'ru' ? 'Открываю карту' : 'Картаны ашамын';
      if (onCommand) onCommand('open-map');
    }

    // === ОБНОВЛЕНИЯ И ИНФОРМАЦИЯ ===
    else if (lower.includes('обновить') || lower.includes('жаңарту') || lower.includes('refresh')) {
      reply = language === 'ru' ? 'Обновляю список заказов' : 'Тапсырыстар тізімін жаңартамын';
      if (onCommand) onCommand('refresh');
    }
    else if (lower.includes('статус заказа') || lower.includes('тапсырыс күйі') || lower.includes('где мой заказ')) {
      reply = language === 'ru' ? 'Показываю текущий статус заказов' : 'Тапсырыстардың ағымдағы күйін көрсетемін';
      if (onCommand) onCommand('order-status');
    }
    else if (lower.includes('сколько заказов') || lower.includes('қанша тапсырыс')) {
      reply = language === 'ru' ? `У вас ${ordersCount} активных заказов` : `Сізде ${ordersCount} белсенді тапсырыс бар`;
      if (onCommand) onCommand('order-count');
    }
    else if (lower.includes('мой рейтинг') || lower.includes('менің рейтингім')) {
      reply = language === 'ru' ? `Ваш рейтинг: ${rating.toFixed(1)}` : `Сіздің рейтингіңіз: ${rating.toFixed(1)}`;
      if (onCommand) onCommand('my-rating');
    }
    else if (lower.includes('заработок') || lower.includes('табыс') || lower.includes('зарплата')) {
      reply = language === 'ru' ? `За сегодня вы заработали ${todayEarnings} тенге` : `Бүгін сіз ${todayEarnings} теңге таптыңыз`;
      if (onCommand) onCommand('earnings');
    }

    // === ЗВОНКИ ===
    else if (lower.includes('позвонить клиенту') || lower.includes('тапсырыс берушіге қоңырау шалу') || lower.includes('звонок клиенту')) {
      reply = language === 'ru' ? 'Совершаю звонок клиенту' : 'Тапсырыс берушіге қоңырау шаламын';
      if (onCommand) onCommand('call-client');
    }
    else if (lower.includes('позвонить диспетчеру') || lower.includes('диспетчерге қоңырау шалу')) {
      reply = language === 'ru' ? 'Совершаю звонок диспетчеру' : 'Диспетчерге қоңырау шаламын';
      if (onCommand) onCommand('call-dispatcher');
    }
    else if (lower.includes('завершить звонок') || lower.includes('қоңырауды аяқтау')) {
      reply = language === 'ru' ? 'Завершаю звонок' : 'Қоңырауды аяқтаймын';
      if (onCommand) onCommand('end-call');
    }

    // === ДЕЙСТВИЯ С ФОТО И ПОДПИСЬЮ ===
    else if (lower.includes('сделать фото') || lower.includes('фото түсіру')) {
      reply = language === 'ru' ? 'Открываю камеру для фото' : 'Фото түсіру үшін камераны ашамын';
      if (onCommand) onCommand('take-photo');
    }
    else if (lower.includes('поставить подпись') || lower.includes('қол қою')) {
      reply = language === 'ru' ? 'Открываю поле для подписи' : 'Қол қою өрісін ашамын';
      if (onCommand) onCommand('signature');
    }

    // === СПРАВКА ===
    else if (lower.includes('помощь') || lower.includes('көмек') || lower.includes('что ты умеешь') || lower.includes('команды')) {
      reply = language === 'ru' 
        ? 'Доступные команды: создать заказ, мои заказы, профиль, выйти, назад, главная, принять заказ, забрал груз, в пути, доставить, оптимизировать маршрут, построить маршрут до склада/клиента, позвонить клиенту/диспетчеру, обновить, статус заказа, сколько заказов, мой рейтинг, заработок, сделать фото, поставить подпись' 
        : 'Қолжетімді командалар: жаңа тапсырыс, менің тапсырыстарым, профиль, шығу, артқа, басты бет, тапсырысты қабылдау, жүкті алдым, жолда, жеткізу, маршрутты оңтайландыру, қоймаға/клиентке маршрут, клиентке/диспетчерге қоңырау шалу, жаңарту, тапсырыс күйі, қанша тапсырыс, менің рейтингім, табыс, фото түсіру, қол қою';
      if (onCommand) onCommand('help');
    }

    // === НЕИЗВЕСТНАЯ КОМАНДА ===
    else {
      reply = language === 'ru' 
        ? 'Не понял команду. Скажите "помощь" для списка команд' 
        : 'Команданы түсінбедім. Командалар тізімі үшін "көмек" деңіз';
    }
    
    setResponse(reply);
    speak(reply, language);
  };

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}>
      <button
        onClick={startListening}
        style={{
          background: listening ? '#ef4444' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: 60,
          height: 60,
          fontSize: 28,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'all 0.2s'
        }}
        title={language === 'ru' ? 'Голосовой помощник' : 'Дауыстық көмекші'}
      >
        🎙️
      </button>
      {transcript && (
        <div style={{ background: 'white', padding: 8, borderRadius: 8, marginTop: 8, fontSize: 12, maxWidth: 200 }}>
          {language === 'ru' ? 'Вы сказали:' : 'Сіз айттыңыз:'} "{transcript}"
        </div>
      )}
      {response && (
        <div style={{ background: '#e0f2fe', padding: 8, borderRadius: 8, marginTop: 8, fontSize: 12, maxWidth: 200 }}>
          🤖 {response}
        </div>
      )}
      {isSpeaking && <div style={{ fontSize: 10, marginTop: 4 }}>🔊</div>}
    </div>
  );
}