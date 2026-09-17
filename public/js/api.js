// Общий модуль для работы с API и авторизацией (QazconHub Terminal)
const API = {
  getToken() {
    return localStorage.getItem('token');
  },
  setToken(t) {
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  },
  setUser(u) {
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
  },
  logout() {
    this.setToken(null);
    this.setUser(null);
    window.location.href = '/';
  },
  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
      this.logout();
      throw new Error('Сессия истекла');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.err || 'Ошибка запроса');
    return data;
  },
  get(path) {
    return this.request(path);
  },
  post(path, body) {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  },
  patch(path, body) {
    return this.request(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  async uploadPhoto(file) {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/upload-photo', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.getToken() },
      body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.err || 'Ошибка загрузки');
    return data;
  }
};

// Подключение Socket.IO для реального времени
function connectSocket() {
  const token = API.getToken();
  if (!token || typeof io === 'undefined') return null;
  const socket = io({ auth: { token } });
  return socket;
}

// ---------- Словари статусов терминала ----------
const ROLE_LABELS = {
  admin: 'Администратор',
  director: 'Директор',
  dispatcher: 'Диспетчер',
  ppjt: 'Диспетчер ППЖТ',
  receiver: 'Приёмосдатчик',
  crane: 'Крановщик',
  store: 'Кладовщик',
  guard: 'Охрана',
  customs: 'Таможенный отдел',
  finance: 'Расчётный отдел',
  shift: 'Начальник смены',
  client: 'Клиент',
  driver: 'Водитель'
};

const CONTAINER_STATUS = {
  'на_терминале': 'На терминале',
  'ожидает_вывоза': 'Ожидает вывоза',
  'вывезен': 'Вывезен',
  'в_обработке': 'В обработке'
};

const WAGON_STATUS = {
  'на_пути': 'На пути',
  'выгрузка': 'Выгрузка',
  'погрузка': 'Погрузка',
  'готов_к_отправке': 'Готов к отправке',
  'отправлен': 'Отправлен'
};

const REQUEST_STATUS = {
  'новая': 'Новая',
  'подтверждена': 'Подтверждена',
  'выполняется': 'Выполняется',
  'завершена': 'Завершена',
  'отклонена': 'Отклонена'
};

const QUEUE_STATUS = {
  'ожидание': 'Ожидание',
  'вызван': 'Вызван',
  'на_территории': 'На территории',
  'завершён': 'Завершён'
};

const EQUIPMENT_STATUS = {
  'свободна': 'Свободна',
  'работает': 'Работает',
  'на_ремонте': 'На ремонте'
};

const VEHICLE_STATUS = {
  'на_территории': 'На территории',
  'выехал': 'Выехал'
};

function statusLabel(s, map) {
  if (map) return map[s] || s;
  return s;
}

function statusClass(s) {
  const map = {
    'на_терминале': 'st-ok',
    'вывезен': 'st-done',
    'ожидает_вывоза': 'st-warn',
    'в_обработке': 'st-warn',
    'на_пути': 'st-info',
    'выгрузка': 'st-warn',
    'погрузка': 'st-warn',
    'готов_к_отправке': 'st-ok',
    'отправлен': 'st-done',
    'новая': 'st-new',
    'подтверждена': 'st-assigned',
    'выполняется': 'st-onway',
    'завершена': 'st-done',
    'отклонена': 'st-cancelled',
    'ожидание': 'st-new',
    'вызван': 'st-assigned',
    'на_территории': 'st-ok',
    'завершён': 'st-done',
    'свободна': 'st-ok',
    'работает': 'st-onway',
    'на_ремонте': 'st-cancelled',
    'выехал': 'st-done',
    'активен': 'st-ok',
    'использован': 'st-done'
  };
  return map[s] || '';
}

function esc(s) {
  var q = String.fromCharCode(39);
  var aq = '&#' + '39;';
  return String(s == null ? '' : s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(new RegExp(q, 'g'), aq);
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

// PWA: регистрация service worker. Без неё офлайн-режим и установка приложения на
// домашний экран не работают, хотя sw.js и manifest.json корректно отдаются сервером.
// Регистрация разрешена только в защищённом контексте (HTTPS или localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch((e) => console.warn('Service worker не зарегистрирован:', e.message));
  });
}
