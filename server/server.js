require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Дефолтный секрет лежит в открытом репозитории, поэтому он годится только для
// локальной разработки: в продакшене подпись токенов им означала бы, что любой
// желающий может выпустить токен с ролью admin.
const DEFAULT_JWT_SECRET = 'qazconhub-terminal-secret-change-in-prod';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[FATAL] Переменная окружения JWT_SECRET не задана.\n' +
      '        Запуск в продакшене с секретом из репозитория запрещён: токены стали бы\n' +
      '        подделываемыми. Задайте секрет (например, JWT_SECRET="$(openssl rand -hex 32)").'
    );
    process.exit(1);
  }
  console.warn(
    '[SECURITY] JWT_SECRET не задан — используется небезопасный секрет по умолчанию.\n' +
    '           Локально: cp .env.example .env и укажите случайное значение.'
  );
}

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { err: 'Слишком много запросов. Попробуйте позже.' }
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { err: 'Слишком много попыток входа. Подождите.' }
});

// ---------- Загрузка фото ----------
const uploadDir = path.join(__dirname, '../public/uploads');
require('fs-extra').ensureDirSync(uploadDir);
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.\-]/g, '_'))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

// ---------- JWT helpers ----------
function signToken(user) {
  return jwt.sign(
    { id: user.id, login: user.login, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ err: 'Не авторизован' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ err: 'Недействительный токен' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ err: 'Доступ запрещён' });
    }
    next();
  };
}

// ---------- Логирование действий ----------
function logAction(req, action, details) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, user_name, action, details) VALUES (?,?,?,?)')
      .run(req.user.id, req.user.name, action, details || '');
  } catch (e) { /* ignore */ }
}

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  socket.on('terminal:join', (role) => {
    socket.join('terminal');
    if (role) socket.join('role:' + role);
  });
});

function emitUpdate(event, data) {
  io.to('terminal').emit(event, data);
}

// ---------- Документооборот: справочные значения ----------
// Организация терминала по умолчанию — как в шапках документов из образцов работы.
const DEFAULT_ORG = 'ТОО "International Logistics Corporation"';

const OPERATION_KINDS = ['завоз', 'вывоз'];
const OPERATION_STATUSES = ['черновик', 'оформлен', 'завершён', 'отменён'];
const INVOICE_STATUSES = ['черновик', 'оформлена', 'закрыта'];
const TRANSPORT_MODES = ['Автотранспортом', 'Железной дорогой'];
const COUNTERPARTY_KINDS = ['организация', 'контрагент', 'собственник', 'получатель', 'перевозчик'];
const PASS_TYPES = ['разовый', 'постоянный'];
// «Статус» груза в карточке документа — как в образце: Порожний / Груженный.
const CARGO_STATUSES = ['Порожний', 'Груженный', 'Груженный (реф)'];
// Реестр прибытия ЖД транспортом: «Вид к-ра» — типоразмер контейнера либо порожний,
// статус отражает этап обработки прибывшей подачи.
const RAIL_KINDS = ['20', '40', '45', 'Порожний'];
const RAIL_STATUSES = ['ожидается', 'прибыл', 'оформлен'];
// Типоразмер и вид груза контейнера, создаваемого автоматически из записи прибытия.
const RAIL_KIND_TO_CONTAINER = {
  '20': { size: '20', type: 'Гружёный' },
  '40': { size: '40', type: 'Гружёный' },
  '45': { size: '45', type: 'Гружёный' },
  'Порожний': { size: '20', type: 'Порожний' }
};

// Разрядность номеров как в образцах: Завоз 06859, Вывоз 000014639,
// Расходная накладная 000004853, Пропуск 000020129
const DOC_NUMBER_WIDTH = { 'завоз': 5, 'вывоз': 9, 'накладная': 9, 'пропуск': 9, 'прибытие жд': 5 };

const nextDocNoTx = db.transaction((scope) => {
  const width = DOC_NUMBER_WIDTH[scope] || 9;
  const row = db.prepare('SELECT last_no FROM doc_seq WHERE scope = ?').get(scope);
  const next = (row ? row.last_no : 0) + 1;
  if (row) db.prepare('UPDATE doc_seq SET last_no = ? WHERE scope = ?').run(next, scope);
  else db.prepare('INSERT INTO doc_seq (scope, last_no) VALUES (?,?)').run(scope, next);
  return String(next).padStart(width, '0');
});

function docNo(scope) {
  return nextDocNoTx(scope);
}

// Белый список полей: наружу и в базу уходит только перечисленное.
function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body && body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

function intOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Значение из фиксированного списка — защита от произвольных статусов в базе.
function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) >= 0 ? value : fallback;
}

function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ---------- AUTH ----------
app.post('/api/auth', authLimiter, (req, res) => {
  const { login, pass } = req.body || {};
  if (!login || !pass) return res.status(400).json({ err: 'Введите логин и пароль' });
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(String(login).trim());
  if (!user || !bcrypt.compareSync(String(pass), user.pass_hash)) {
    return res.status(401).json({ err: 'Неверный логин или пароль' });
  }
  if (!user.active) return res.status(403).json({ err: 'Аккаунт заблокирован' });
  const token = signToken(user);
  res.json({
    ok: true,
    token,
    user: { id: user.id, login: user.login, role: user.role, name: user.name, terminal: user.terminal }
  });
});

// ---------- РОЛИ ----------
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

app.get('/api/roles', authRequired, (_, res) => {
  res.json(ROLE_LABELS);
});

// ---------- СТАТИСТИКА ----------
app.get('/api/stats', authRequired, (_, res) => {
  const containers = db.prepare('SELECT COUNT(*) c FROM containers').get().c;
  const containersFull = db.prepare("SELECT COUNT(*) c FROM containers WHERE status='на_терминале'").get().c;
  const wagons = db.prepare('SELECT COUNT(*) c FROM wagons').get().c;
  const wagonsOnTrack = db.prepare("SELECT COUNT(*) c FROM wagons WHERE status='на_пути'").get().c;
  const equipment = db.prepare('SELECT COUNT(*) c FROM equipment').get().c;
  const eqFree = db.prepare("SELECT COUNT(*) c FROM equipment WHERE status='свободна'").get().c;
  const vehicles = db.prepare("SELECT COUNT(*) c FROM vehicles WHERE status='на_территории'").get().c;
  const queue = db.prepare("SELECT COUNT(*) c FROM queue WHERE status='ожидание'").get().c;
  const requestsNew = db.prepare("SELECT COUNT(*) c FROM requests WHERE status='новая'").get().c;
  // Документооборот: завоз/вывоз в работе и накладные за сутки
  const operationsOpen = db.prepare("SELECT COUNT(*) c FROM operations WHERE status IN ('черновик','оформлен')").get().c;
  const operationsIn = db.prepare("SELECT COUNT(*) c FROM operations WHERE kind='завоз' AND date(op_date)=date('now')").get().c;
  const operationsOut = db.prepare("SELECT COUNT(*) c FROM operations WHERE kind='вывоз' AND date(op_date)=date('now')").get().c;
  const invoicesToday = db.prepare("SELECT COUNT(*) c FROM invoices WHERE date(doc_date)=date('now')").get().c;
  const passesToday = db.prepare("SELECT COUNT(*) c FROM passes WHERE date(created_at)=date('now')").get().c;
  // Прибытие ЖД: поданные за сутки, за текущий месяц года и требующие сверки пломбы
  const railToday = db.prepare("SELECT COUNT(*) c FROM rail_arrivals WHERE date(created_at)=date('now')").get().c;
  const railMonth = db.prepare(
    "SELECT COUNT(*) c FROM rail_arrivals WHERE arrival_year = CAST(strftime('%Y','now') AS INTEGER) AND arrival_month = CAST(strftime('%m','now') AS INTEGER)"
  ).get().c;
  const railSealMismatch = db.prepare('SELECT seal_doc, seal_fact FROM rail_arrivals').all()
    .filter(sealMismatch).length;
  res.json({
    containers, containersFull, wagons, wagonsOnTrack, equipment, eqFree, vehicles, queue, requestsNew,
    operationsOpen, operationsIn, operationsOut, invoicesToday, passesToday,
    railToday, railMonth, railSealMismatch
  });
});

// ---------- КОНТЕЙНЕРЫ ----------
app.get('/api/containers', authRequired, (_, res) => {
  res.json(db.prepare('SELECT * FROM containers ORDER BY created_at DESC').all());
});

app.post('/api/containers', authRequired, roleRequired('admin', 'dispatcher', 'receiver', 'guard', 'shift'), (req, res) => {
  const { number, size, type, client, cargo, weight } = req.body || {};
  if (!number) return res.status(400).json({ err: 'Укажите номер контейнера' });
  try {
    const info = db.prepare(
      'INSERT INTO containers (number, size, type, client, cargo, weight) VALUES (?,?,?,?,?,?)'
    ).run(String(number).trim().toUpperCase(), String(size || '20'), String(type || 'Гружёный'),
      String(client || ''), String(cargo || ''), Number(weight || 0));
    const c = db.prepare('SELECT * FROM containers WHERE id = ?').get(info.lastInsertRowid);
    logAction(req, 'container:create', 'Контейнер ' + c.number);
    emitUpdate('container:update', c);
    res.status(201).json(c);
  } catch (e) {
    res.status(409).json({ err: 'Контейнер с таким номером уже существует' });
  }
});

app.patch('/api/containers/:id', authRequired, roleRequired('admin', 'dispatcher', 'receiver', 'crane', 'shift'), (req, res) => {
  const c = db.prepare('SELECT * FROM containers WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ err: 'Контейнер не найден' });
  const fields = ['status', 'zone', 'row', 'stack', 'tier', 'client', 'cargo', 'weight', 'type', 'size'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) return res.status(400).json({ err: 'Нет полей' });
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE containers SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(updates), c.id);
  const updated = db.prepare('SELECT * FROM containers WHERE id = ?').get(c.id);
  logAction(req, 'container:update', 'Контейнер ' + updated.number + ' → ' + (updated.zone || '') + '/' + (updated.row || ''));
  emitUpdate('container:update', updated);
  res.json(updated);
});

// ---------- ПУТИ (ППЖТ) ----------
app.get('/api/tracks', authRequired, (_, res) => {
  const tracks = db.prepare('SELECT * FROM tracks ORDER BY id').all();
  const wagons = db.prepare("SELECT * FROM wagons WHERE status = 'на_пути'").all();
  res.json(tracks.map(t => ({
    ...t,
    wagons: wagons.filter(w => w.track_id === t.id),
    occupied: wagons.filter(w => w.track_id === t.id).length
  })));
});

app.post('/api/tracks', authRequired, roleRequired('admin', 'ppjt'), (req, res) => {
  const { name, capacity, zone } = req.body || {};
  if (!name) return res.status(400).json({ err: 'Укажите название пути' });
  try {
    const info = db.prepare('INSERT INTO tracks (name, capacity, zone) VALUES (?,?,?)')
      .run(String(name).trim(), Number(capacity || 20), String(zone || ''));
    res.status(201).json(db.prepare('SELECT * FROM tracks WHERE id = ?').get(info.lastInsertRowid));
  } catch {
    res.status(409).json({ err: 'Путь с таким названием уже существует' });
  }
});

// ---------- ВАГОНЫ ----------
app.get('/api/wagons', authRequired, (_, res) => {
  res.json(db.prepare(`
    SELECT w.*, t.name AS track_name
    FROM wagons w LEFT JOIN tracks t ON t.id = w.track_id
    ORDER BY w.created_at DESC
  `).all());
});

app.post('/api/wagons', authRequired, roleRequired('admin', 'ppjt', 'receiver'), (req, res) => {
  const { number, cargo, owner, track_id, operation } = req.body || {};
  if (!number) return res.status(400).json({ err: 'Укажите номер вагона' });
  try {
    const info = db.prepare(
      'INSERT INTO wagons (number, cargo, owner, track_id, operation) VALUES (?,?,?,?,?)'
    ).run(String(number).trim(), String(cargo || ''), String(owner || ''),
      Number(track_id) || null, String(operation || 'прибытие'));
    const w = db.prepare('SELECT * FROM wagons WHERE id = ?').get(info.lastInsertRowid);
    logAction(req, 'wagon:arrive', 'Вагон ' + w.number);
    emitUpdate('wagon:update', w);
    res.status(201).json(w);
  } catch {
    res.status(409).json({ err: 'Вагон с таким номером уже существует' });
  }
});

app.patch('/api/wagons/:id', authRequired, roleRequired('admin', 'ppjt', 'receiver', 'shift'), (req, res) => {
  const w = db.prepare('SELECT * FROM wagons WHERE id = ?').get(Number(req.params.id));
  if (!w) return res.status(404).json({ err: 'Вагон не найден' });
  const fields = ['track_id', 'status', 'direction', 'dest_station', 'shipper', 'operation', 'cargo', 'owner'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) return res.status(400).json({ err: 'Нет полей' });
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE wagons SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(updates), w.id);
  const updated = db.prepare('SELECT * FROM wagons WHERE id = ?').get(w.id);
  logAction(req, 'wagon:update', 'Вагон ' + updated.number + ' → ' + (updated.status || ''));
  emitUpdate('wagon:update', updated);
  res.json(updated);
});

// ---------- СПЕЦТЕХНИКА ----------
app.get('/api/equipment', authRequired, (_, res) => {
  res.json(db.prepare('SELECT * FROM equipment ORDER BY id').all());
});

app.post('/api/equipment', authRequired, roleRequired('admin', 'dispatcher', 'shift'), (req, res) => {
  const { name, type, plate, driver } = req.body || {};
  if (!name) return res.status(400).json({ err: 'Укажите название техники' });
  const info = db.prepare('INSERT INTO equipment (name, type, plate, driver) VALUES (?,?,?,?)')
    .run(String(name).trim(), String(type || 'Кран'), String(plate || ''), String(driver || ''));
  res.status(201).json(db.prepare('SELECT * FROM equipment WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/equipment/:id', authRequired, roleRequired('admin', 'dispatcher', 'crane', 'shift'), (req, res) => {
  const e = db.prepare('SELECT * FROM equipment WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ err: 'Техника не найдена' });
  const fields = ['status', 'driver', 'lat', 'lon', 'fuel', 'hours'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) return res.status(400).json({ err: 'Нет полей' });
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE equipment SET ${setClause} WHERE id = ?`).run(...Object.values(updates), e.id);
  const updated = db.prepare('SELECT * FROM equipment WHERE id = ?').get(e.id);
  emitUpdate('equipment:update', updated);
  res.json(updated);
});

// ---------- ТРАНСПОРТ (въезд/выезд) ----------
app.get('/api/vehicles', authRequired, (_, res) => {
  res.json(db.prepare('SELECT * FROM vehicles ORDER BY time_in DESC').all());
});

app.post('/api/vehicles', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (req, res) => {
  const { plate, type, driver, purpose, container_id } = req.body || {};
  if (!plate) return res.status(400).json({ err: 'Укажите госномер' });
  const info = db.prepare(
    'INSERT INTO vehicles (plate, type, driver, purpose, container_id) VALUES (?,?,?,?,?)'
  ).run(String(plate).trim().toUpperCase(), String(type || 'Грузовой'), String(driver || ''),
    String(purpose || ''), Number(container_id) || null);
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid);
  logAction(req, 'vehicle:enter', 'Въезд ' + v.plate);
  emitUpdate('vehicle:update', v);
  res.status(201).json(v);
});

app.patch('/api/vehicles/:id/exit', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(Number(req.params.id));
  if (!v) return res.status(404).json({ err: 'Транспорт не найден' });
  db.prepare("UPDATE vehicles SET status = 'выехал', time_out = datetime('now') WHERE id = ?").run(v.id);
  const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(v.id);
  logAction(req, 'vehicle:exit', 'Выезд ' + updated.plate);
  emitUpdate('vehicle:update', updated);
  res.json(updated);
});

// ---------- ЗАЯВКИ КЛИЕНТОВ ----------
app.get('/api/requests', authRequired, (req, res) => {
  const { role, id } = req.user;
  let rows;
  if (role === 'client') {
    rows = db.prepare('SELECT * FROM requests WHERE client_id = ? ORDER BY created_at DESC').all(id);
  } else {
    rows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

app.post('/api/requests', authRequired, roleRequired('client', 'admin', 'dispatcher'), (req, res) => {
  const { type, container_number, cargo, weight, date_slot, time_slot, comment } = req.body || {};
  if (!container_number && !cargo) return res.status(400).json({ err: 'Укажите контейнер или груз' });
  const info = db.prepare(
    'INSERT INTO requests (client_id, client_name, type, container_number, cargo, weight, date_slot, time_slot, comment) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(req.user.id, req.user.name, String(type || 'контейнер'), String(container_number || ''),
    String(cargo || ''), Number(weight || 0), String(date_slot || ''), String(time_slot || ''), String(comment || ''));
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);
  emitUpdate('request:update', r);
  res.status(201).json(r);
});

app.patch('/api/requests/:id', authRequired, roleRequired('admin', 'dispatcher', 'shift', 'client'), (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ err: 'Заявка не найдена' });
  if (req.user.role === 'client' && r.client_id !== req.user.id) {
    return res.status(403).json({ err: 'Это не ваша заявка' });
  }
  const fields = ['status', 'date_slot', 'time_slot', 'comment'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (Object.keys(updates).length === 0) return res.status(400).json({ err: 'Нет полей' });
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE requests SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(updates), r.id);
  const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(r.id);
  emitUpdate('request:update', updated);
  res.json(updated);
});

// ---------- ЭЛЕКТРОННАЯ ОЧЕРЕДЬ ----------
app.get('/api/queue', authRequired, (_, res) => {
  res.json(db.prepare('SELECT * FROM queue ORDER BY created_at ASC').all());
});

app.post('/api/queue', authRequired, roleRequired('driver', 'client', 'admin', 'dispatcher'), (req, res) => {
  const { plate, driver, purpose, slot } = req.body || {};
  if (!plate) return res.status(400).json({ err: 'Укажите госномер' });
  const info = db.prepare('INSERT INTO queue (plate, driver, purpose, slot) VALUES (?,?,?,?)')
    .run(String(plate).trim().toUpperCase(), String(driver || ''), String(purpose || ''), String(slot || ''));
  const q = db.prepare('SELECT * FROM queue WHERE id = ?').get(info.lastInsertRowid);
  emitUpdate('queue:update', q);
  res.status(201).json(q);
});

app.patch('/api/queue/:id', authRequired, roleRequired('admin', 'dispatcher', 'guard', 'shift'), (req, res) => {
  const q = db.prepare('SELECT * FROM queue WHERE id = ?').get(Number(req.params.id));
  if (!q) return res.status(404).json({ err: 'Запись не найдена' });
  const { status, slot } = req.body || {};
  db.prepare('UPDATE queue SET status = ?, slot = ? WHERE id = ?')
    .run(String(status || q.status), String(slot || q.slot), q.id);
  const updated = db.prepare('SELECT * FROM queue WHERE id = ?').get(q.id);
  emitUpdate('queue:update', updated);
  res.json(updated);
});

// ---------- ПРОПУСКА (ОХРАНА) ----------
app.get('/api/passes', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (_, res) => {
  res.json(db.prepare('SELECT * FROM passes ORDER BY created_at DESC').all());
});

app.post('/api/passes', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (req, res) => {
  const { plate, type, operation_id } = req.body || {};
  if (!plate) return res.status(400).json({ err: 'Укажите госномер' });
  const opId = intOrNull(operation_id);
  const op = opId ? db.prepare('SELECT * FROM operations WHERE id = ?').get(opId) : null;
  // Нумерация пропусков сквозная, как в журнале терминала: Пропуск 000020129
  const code = docNo('пропуск');
  const info = db.prepare(
    "INSERT INTO passes (code, plate, type, operation_id, doc_date) VALUES (?,?,?,?,datetime('now'))"
  ).run(code, String(plate).trim().toUpperCase(), oneOf(type, PASS_TYPES, 'разовый'), op ? op.id : null);
  const p = db.prepare('SELECT * FROM passes WHERE id = ?').get(info.lastInsertRowid);
  if (op) {
    db.prepare("UPDATE operations SET pass_id = ?, updated_at = datetime('now') WHERE id = ?").run(p.id, op.id);
  }
  logAction(req, 'pass:create', 'Пропуск ' + p.code + ' для ' + p.plate + (op ? ' (' + op.doc_no + ')' : ''));
  emitUpdate('pass:update', p);
  res.status(201).json(p);
});

// ---------- OCR / ШЛАГБАУМЫ (симуляция) ----------
// Имитация распознавания госномера камерой OCR
app.post('/api/ocr/recognize', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (req, res) => {
  const { plate } = req.body || {};
  if (!plate) return res.status(400).json({ err: 'Нет данных для распознавания' });
  const normalized = String(plate).trim().toUpperCase();
  // Проверяем, есть ли транспорт с таким номером
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE plate = ?').get(normalized);
  const pass = db.prepare("SELECT * FROM passes WHERE plate = ? AND status = 'активен'").get(normalized);
  const allowed = !!(vehicle || pass);
  logAction(req, 'ocr:recognize', 'Распознан номер ' + normalized + ' → ' + (allowed ? 'доступ разрешён' : 'доступ запрещён'));
  res.json({
    plate: normalized,
    recognized: true,
    allowed,
    reason: allowed ? 'Доступ разрешён' : 'Нет пропуска или регистрации',
    barrier: allowed ? 'open' : 'closed'
  });
});

// Автоматическое открытие шлагбаума
app.post('/api/barrier/:action', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (req, res) => {
  const action = req.params.action; // open | close
  if (!['open', 'close'].includes(action)) return res.status(400).json({ err: 'Недопустимое действие' });
  logAction(req, 'barrier:' + action, 'Шлагбаум ' + (action === 'open' ? 'открыт' : 'закрыт'));
  emitUpdate('barrier:update', { action, time: new Date().toISOString() });
  res.json({ ok: true, action });
});

// ---------- ЖУРНАЛ ДЕЙСТВИЙ ----------
app.get('/api/audit', authRequired, roleRequired('admin', 'director', 'shift'), (_, res) => {
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200').all());
});

// ---------- ОТЧЁТЫ (PDF) ----------
app.get('/api/report/containers', authRequired, roleRequired('admin', 'director', 'finance', 'shift'), (_, res) => {
  const containers = db.prepare('SELECT * FROM containers ORDER BY created_at DESC').all();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="containers-report.pdf"');
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);
  doc.fontSize(20).fillColor('#1565C0').text('QazconHub — Отчёт по контейнерам', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).fillColor('#666').text('Сформировано: ' + new Date().toLocaleString('ru-RU'), { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).fillColor('#000');
  containers.forEach(c => {
    doc.text(`${c.number} | ${c.size}фт | ${c.type} | ${c.status} | ${c.zone}/${c.row}/${c.stack}/${c.tier} | ${c.client || '—'}`);
    doc.moveDown(0.3);
  });
  doc.moveDown(2);
  doc.fontSize(14).fillColor('#1565C0').text(`Всего контейнеров: ${containers.length}`, { align: 'right' });
  doc.end();
});

app.get('/api/report/wagons', authRequired, roleRequired('admin', 'director', 'finance', 'shift'), (_, res) => {
  const wagons = db.prepare('SELECT w.*, t.name AS track_name FROM wagons w LEFT JOIN tracks t ON t.id = w.track_id ORDER BY w.created_at DESC').all();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="wagons-report.pdf"');
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);
  doc.fontSize(20).fillColor('#1565C0').text('QazconHub — Отчёт по вагонам', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).fillColor('#666').text('Сформировано: ' + new Date().toLocaleString('ru-RU'), { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).fillColor('#000');
  wagons.forEach(w => {
    doc.text(`${w.number} | ${w.cargo || '—'} | ${w.owner || '—'} | путь: ${w.track_name || '—'} | ${w.status}`);
    doc.moveDown(0.3);
  });
  doc.moveDown(2);
  doc.fontSize(14).fillColor('#1565C0').text(`Всего вагонов: ${wagons.length}`, { align: 'right' });
  doc.end();
});

app.get('/api/report/rail-arrivals', authRequired, roleRequired('admin', 'director', 'finance', 'shift', 'receiver', 'ppjt'), (req, res) => {
  const where = [];
  const params = [];
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (Number.isFinite(year) && year > 2000) { where.push('r.arrival_year = ?'); params.push(year); }
  if (Number.isFinite(month) && month >= 1 && month <= 12) { where.push('r.arrival_month = ?'); params.push(month); }
  const rows = db.prepare(
    RAIL_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY r.id DESC LIMIT 500'
  ).all(...params);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="rail-arrivals-report.pdf"');
  const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
  doc.pipe(res);
  doc.fontSize(18).fillColor('#1565C0').text('QazconHub — Прибытие ЖД транспортом', { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#666').text(
    (year ? 'Период: ' + (month ? String(month).padStart(2, '0') + '.' : '') + year : 'Все периоды') +
    ' · сформировано: ' + new Date().toLocaleString('ru-RU'),
    { align: 'center' }
  );
  doc.moveDown(1.2);

  const header = '№ | Прибытие | Код | Вагон | Контейнер | Вид | Вес | Пломба док. | Пломба факт | Собственник | Грузополучатель | ГПС';
  doc.fontSize(8).fillColor('#000').text(header);
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - 36, doc.y + 2).strokeColor('#ccc').stroke();
  doc.moveDown(0.4);

  rows.forEach((r) => {
    const period = String(r.arrival_month || '').padStart(2, '0') + '.' + (r.arrival_year || '') +
      (r.arrival_time ? ' ' + r.arrival_time : '');
    const seal = sealMismatch(r) ? ' ≠' : '';
    doc.fontSize(8).fillColor(seal ? '#C62828' : '#000').text(
      [r.doc_no, period, r.code || '—', r.wagon_number || '—', r.container_number || '—',
       r.container_kind || '—', (r.container_weight || 0) + ' т', r.seal_doc || '—',
       (r.seal_fact || '—') + seal, r.owner_name || '—', r.recipient_name || '—',
       r.has_gps ? (r.gps_mark || 'с меткой') : 'без метки'].join(' | ')
    );
    doc.moveDown(0.25);
  });

  const weight = rows.reduce((sum, r) => sum + (Number(r.container_weight) || 0), 0);
  const mismatch = rows.filter(sealMismatch).length;
  doc.moveDown(1);
  doc.fontSize(11).fillColor('#1565C0').text(
    `Всего записей: ${rows.length} · вес: ${weight.toFixed(2)} т · расхождений пломб: ${mismatch}`,
    { align: 'right' }
  );
  doc.end();
});

// ============================================================
// ПРИБЫТИЕ ЖД ТРАНСПОРТОМ (rail_arrivals)
// ============================================================
// Реестр подачи контейнеров железной дорогой. Пломба по документу и фактическая
// пломба хранятся раздельно и сверяются при осмотре: расхождение — сигнал
// приёмосдатчику. Нормализация (trim + верхний регистр) вынесена в одну функцию,
// иначе список, статистика и отчёт считали бы расхождения по-разному.
function normSeal(v) {
  return String(v == null ? '' : v).trim().toUpperCase();
}

// Пломба заполнена в документе, но фактическая либо не совпадает, либо не указана.
function sealMismatch(row) {
  const doc = normSeal(row && row.seal_doc);
  if (!doc) return false;
  return doc !== normSeal(row && row.seal_fact);
}

const RAIL_SELECT = `
  SELECT r.*,
         ow.name AS owner_name,
         rc.name AS recipient_name,
         u.name AS responsible_name,
         c.size AS container_ref_size,
         c.type AS container_ref_type,
         w.status AS wagon_ref_status
  FROM rail_arrivals r
  LEFT JOIN counterparties ow ON ow.id = r.owner_id
  LEFT JOIN counterparties rc ON rc.id = r.recipient_id
  LEFT JOIN users u ON u.id = r.responsible_id
  LEFT JOIN containers c ON c.id = r.container_id
  LEFT JOIN wagons w ON w.id = r.wagon_id
`;

function withRailComputed(row) {
  if (row) row.seal_mismatch = sealMismatch(row) ? 1 : 0;
  return row;
}

function getRailArrival(id) {
  return withRailComputed(db.prepare(RAIL_SELECT + ' WHERE r.id = ?').get(Number(id)));
}

// Интеграция со справочниками: контейнер и вагон прибытия либо находятся в системе,
// либо создаются — так запись из реестра сразу видна в разделах «Контейнеры»
// и «Пути и вагоны», а не остаётся изолированной строкой.
function ensureContainer(number, kind, weight, clientName) {
  const num = String(number || '').trim().toUpperCase();
  if (!num) return null;
  const found = db.prepare('SELECT id FROM containers WHERE number = ?').get(num);
  if (found) return found.id;
  const shape = RAIL_KIND_TO_CONTAINER[kind] || RAIL_KIND_TO_CONTAINER['20'];
  const info = db.prepare(
    'INSERT INTO containers (number, size, type, status, client, weight) VALUES (?,?,?,?,?,?)'
  ).run(num, shape.size, shape.type, 'на_терминале', String(clientName || ''), Number(weight) || 0);
  emitUpdate('container:update', { number: num });
  return info.lastInsertRowid;
}

function ensureWagon(number, ownerName) {
  const num = String(number || '').trim().toUpperCase();
  if (!num) return null;
  const found = db.prepare('SELECT id FROM wagons WHERE number = ?').get(num);
  if (found) return found.id;
  const info = db.prepare('INSERT INTO wagons (number, owner, status, operation) VALUES (?,?,?,?)')
    .run(num, String(ownerName || ''), 'выгрузка', 'прибытие');
  emitUpdate('wagon:update', { number: num });
  return info.lastInsertRowid;
}

const RAIL_FIELDS = [
  'arrival_year', 'arrival_month', 'arrival_time', 'code',
  'wagon_number', 'wagon_id', 'container_number', 'container_id', 'container_kind',
  'container_weight', 'seal_doc', 'seal_fact', 'owner_id', 'recipient_id',
  'gps_mark', 'has_gps', 'status', 'comment', 'responsible_id'
];

const RAIL_TEXT_UPPER = ['code', 'wagon_number', 'container_number', 'seal_doc', 'seal_fact', 'gps_mark'];
const RAIL_REF_FIELDS = ['wagon_id', 'container_id', 'owner_id', 'recipient_id', 'responsible_id'];

function normalizeRailFields(raw, current) {
  const out = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (RAIL_REF_FIELDS.indexOf(key) >= 0) {
      out[key] = intOrNull(value);
    } else if (key === 'arrival_year') {
      const y = Number(value);
      out[key] = Number.isFinite(y) && y >= 2000 && y <= 2100 ? Math.trunc(y) : (current ? current.arrival_year : null);
    } else if (key === 'arrival_month') {
      const m = Number(value);
      out[key] = Number.isFinite(m) && m >= 1 && m <= 12 ? Math.trunc(m) : (current ? current.arrival_month : null);
    } else if (key === 'arrival_time') {
      out[key] = /^\d{2}:\d{2}$/.test(String(value || '').trim()) ? String(value).trim() : '';
    } else if (key === 'container_kind') {
      out[key] = oneOf(value, RAIL_KINDS, current ? current.container_kind : '20');
    } else if (key === 'status') {
      out[key] = oneOf(value, RAIL_STATUSES, current ? current.status : 'ожидается');
    } else if (key === 'container_weight') {
      const w = Number(value);
      out[key] = Number.isFinite(w) && w >= 0 ? w : 0;
    } else if (key === 'has_gps') {
      out[key] = value ? 1 : 0;
    } else if (RAIL_TEXT_UPPER.indexOf(key) >= 0) {
      out[key] = String(value == null ? '' : value).trim().toUpperCase();
    } else {
      out[key] = value == null ? '' : String(value);
    }
  }
  return out;
}

// Период прибытия по умолчанию — текущий месяц года: реестр ведётся помесячно.
function railPeriod(fields, current) {
  const now = new Date();
  const year = (fields && fields.arrival_year) || (current && current.arrival_year) || now.getFullYear();
  const month = (fields && fields.arrival_month) || (current && current.arrival_month) || (now.getMonth() + 1);
  const time = fields && fields.arrival_time !== undefined
    ? fields.arrival_time
    : (current && current.arrival_time) || now.toTimeString().slice(0, 5);
  return { year, month, time: time || '', at: `${year}-${String(month).padStart(2, '0')}-01 ${time || '00:00'}:00` };
}

app.get('/api/rail-arrivals', authRequired, (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const kind = String(req.query.kind || '');
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim().toLowerCase();
  const onlyMismatch = String(req.query.mismatch || '') === '1';

  let sql = RAIL_SELECT + ' WHERE 1 = 1';
  const params = [];
  if (Number.isFinite(year) && year > 2000) { sql += ' AND r.arrival_year = ?'; params.push(year); }
  if (Number.isFinite(month) && month >= 1 && month <= 12) { sql += ' AND r.arrival_month = ?'; params.push(month); }
  if (RAIL_KINDS.indexOf(kind) >= 0) { sql += ' AND r.container_kind = ?'; params.push(kind); }
  if (RAIL_STATUSES.indexOf(status) >= 0) { sql += ' AND r.status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (LOWER(r.doc_no) LIKE ? OR LOWER(r.container_number) LIKE ?' +
      " OR LOWER(r.wagon_number) LIKE ? OR LOWER(r.code) LIKE ? OR LOWER(r.seal_doc) LIKE ?" +
      ' OR LOWER(r.seal_fact) LIKE ? OR LOWER(r.gps_mark) LIKE ?)';
    const like = '%' + q + '%';
    params.push(like, like, like, like, like, like, like);
  }
  sql += ' ORDER BY r.id DESC LIMIT 500';

  let rows = db.prepare(sql).all(...params).map(withRailComputed);
  if (onlyMismatch) rows = rows.filter((r) => r.seal_mismatch);

  const weight = rows.reduce((sum, r) => sum + (Number(r.container_weight) || 0), 0);
  res.json({
    items: rows,
    summary: {
      total: rows.length,
      weight,
      mismatch: rows.filter((r) => r.seal_mismatch).length,
      withGps: rows.filter((r) => r.has_gps).length,
      byKind: RAIL_KINDS.reduce((acc, k) => {
        acc[k] = rows.filter((r) => r.container_kind === k).length;
        return acc;
      }, {})
    }
  });
});

app.get('/api/rail-arrivals/:id', authRequired, (req, res) => {
  const row = getRailArrival(req.params.id);
  if (!row) return res.status(404).json({ err: 'Запись прибытия не найдена' });
  res.json(row);
});

app.post('/api/rail-arrivals', authRequired, roleRequired('admin', 'dispatcher', 'receiver', 'ppjt', 'shift', 'guard'), (req, res) => {
  const body = req.body || {};
  const fields = normalizeRailFields(pick(body, RAIL_FIELDS), null);

  if (!fields.container_number) {
    return res.status(400).json({ err: 'Укажите номер контейнера' });
  }
  if (fields.has_gps && !fields.gps_mark) {
    return res.status(400).json({ err: 'Укажите номер метки ГПС или снимите признак «с меткой»' });
  }
  if (fields.seal_doc && fields.seal_fact && normSeal(fields.seal_doc) !== normSeal(fields.seal_fact)) {
    // Расхождение допустимо (его и фиксирует реестр), но пользователь должен понимать,
    // что запись попадёт в отчёт как требующая сверки — предупреждаем явно.
    res.setHeader('X-Seal-Mismatch', '1');
  }

  const period = railPeriod(fields, null);
  const ownerName = fields.owner_id
    ? (db.prepare('SELECT name FROM counterparties WHERE id = ?').get(fields.owner_id) || {}).name
    : '';
  const containerId = fields.container_id || ensureContainer(fields.container_number, fields.container_kind, fields.container_weight, ownerName);
  const wagonId = fields.wagon_id || ensureWagon(fields.wagon_number, ownerName);

  const info = db.prepare(`
    INSERT INTO rail_arrivals
      (doc_no, arrival_year, arrival_month, arrival_time, arrival_at, code, wagon_number, wagon_id,
       container_number, container_id, container_kind, container_weight, seal_doc, seal_fact,
       owner_id, recipient_id, gps_mark, has_gps, status, comment, responsible_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    docNo('прибытие жд'),
    period.year,
    period.month,
    period.time,
    period.at,
    String(fields.code || ''),
    String(fields.wagon_number || ''),
    wagonId || null,
    String(fields.container_number),
    containerId || null,
    fields.container_kind || '20',
    Number(fields.container_weight) || 0,
    String(fields.seal_doc || ''),
    String(fields.seal_fact || ''),
    fields.owner_id || null,
    fields.recipient_id || null,
    String(fields.gps_mark || ''),
    fields.has_gps ? 1 : 0,
    fields.status || 'ожидается',
    String(fields.comment || ''),
    fields.responsible_id || req.user.id
  );

  const row = getRailArrival(info.lastInsertRowid);
  logAction(req, 'rail:create', 'Прибытие ' + row.doc_no + ' · ' + row.container_number +
    (row.seal_mismatch ? ' · расхождение пломбы' : ''));
  emitUpdate('rail:update', row);
  res.status(201).json(row);
});

app.patch('/api/rail-arrivals/:id', authRequired, roleRequired('admin', 'dispatcher', 'receiver', 'ppjt', 'shift'), (req, res) => {
  const current = db.prepare('SELECT * FROM rail_arrivals WHERE id = ?').get(Number(req.params.id));
  if (!current) return res.status(404).json({ err: 'Запись прибытия не найдена' });

  const normalized = normalizeRailFields(pick(req.body || {}, RAIL_FIELDS), current);
  const keys = Object.keys(normalized);
  if (!keys.length) return res.status(400).json({ err: 'Нет полей для изменения' });

  const merged = Object.assign({}, current, normalized);
  if (merged.has_gps && !String(merged.gps_mark || '').trim()) {
    return res.status(400).json({ err: 'Укажите номер метки ГПС или снимите признак «с меткой»' });
  }

  const period = railPeriod(normalized, current);
  normalized.arrival_year = period.year;
  normalized.arrival_month = period.month;
  normalized.arrival_time = period.time;
  normalized.arrival_at = period.at;

  // Номера контейнера/вагона могли измениться — синхронизируем справочники.
  const ownerName = merged.owner_id
    ? (db.prepare('SELECT name FROM counterparties WHERE id = ?').get(merged.owner_id) || {}).name
    : '';
  if (!merged.container_id && merged.container_number) {
    normalized.container_id = ensureContainer(merged.container_number, merged.container_kind, merged.container_weight, ownerName) || null;
  }
  if (!merged.wagon_id && merged.wagon_number) {
    normalized.wagon_id = ensureWagon(merged.wagon_number, ownerName) || null;
  }

  const setKeys = Object.keys(normalized);
  const setClause = setKeys.map((k) => k + ' = ?').join(', ');
  db.prepare(`UPDATE rail_arrivals SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...setKeys.map((k) => normalized[k]), current.id);

  const row = getRailArrival(current.id);
  logAction(req, 'rail:update', 'Прибытие ' + row.doc_no + ' → ' + row.status + (row.seal_mismatch ? ' · расхождение пломбы' : ''));
  emitUpdate('rail:update', row);
  res.json(row);
});

// Удаление доступно администратору и диспетчеру: реестр ведётся помесячно,
// ошибочные строки (например, задвоенная подача) нужно убирать без следов в отчётах.
app.delete('/api/rail-arrivals/:id', authRequired, roleRequired('admin', 'dispatcher'), (req, res) => {
  const row = db.prepare('SELECT * FROM rail_arrivals WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ err: 'Запись прибытия не найдена' });
  db.prepare('DELETE FROM rail_arrivals WHERE id = ?').run(row.id);
  logAction(req, 'rail:delete', 'Удалено прибытие ' + row.doc_no);
  emitUpdate('rail:update', { id: row.id, deleted: true });
  res.json({ ok: true, id: row.id });
});

// ---------- UPLOAD ----------
app.post('/api/upload-photo', authRequired, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ err: 'Файл не загружен' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ============================================================
// СПРАВОЧНИКИ (склады, контрагенты, ответственные)
// ============================================================
// Один запрос отдаёт всё, что нужно формам документов: склады, контрагентов,
// ответственных и допустимые значения справочников.
app.get('/api/dictionaries', authRequired, (req, res) => {
  const staff = db.prepare(
    "SELECT id, name, role FROM users WHERE active = 1 AND role NOT IN ('client', 'driver') ORDER BY name"
  ).all();
  res.json({
    org: DEFAULT_ORG,
    warehouses: db.prepare('SELECT * FROM warehouses WHERE active = 1 ORDER BY name').all(),
    counterparties: db.prepare('SELECT * FROM counterparties WHERE active = 1 ORDER BY name').all(),
    responsible: staff,
    counterpartyKinds: COUNTERPARTY_KINDS,
    operationKinds: OPERATION_KINDS,
    operationStatuses: OPERATION_STATUSES,
    invoiceStatuses: INVOICE_STATUSES,
    transportModes: TRANSPORT_MODES,
    cargoStatuses: CARGO_STATUSES,
    passTypes: PASS_TYPES,
    railKinds: RAIL_KINDS,
    railStatuses: RAIL_STATUSES
  });
});

app.get('/api/warehouses', authRequired, (_, res) => {
  res.json(db.prepare('SELECT * FROM warehouses ORDER BY name').all());
});

app.post('/api/warehouses', authRequired, roleRequired('admin', 'dispatcher'), (req, res) => {
  const { name, code } = req.body || {};
  if (!name) return res.status(400).json({ err: 'Укажите название склада' });
  try {
    const info = db.prepare('INSERT INTO warehouses (name, code) VALUES (?,?)')
      .run(String(name).trim(), String(code || '').trim());
    const w = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(info.lastInsertRowid);
    logAction(req, 'warehouse:create', 'Склад ' + w.name);
    emitUpdate('dictionary:update', { kind: 'warehouse', id: w.id });
    res.status(201).json(w);
  } catch (e) {
    res.status(409).json({ err: 'Такой склад уже есть' });
  }
});

app.get('/api/counterparties', authRequired, (_, res) => {
  res.json(db.prepare('SELECT * FROM counterparties ORDER BY name').all());
});

app.post('/api/counterparties', authRequired, roleRequired('admin', 'dispatcher', 'shift'), (req, res) => {
  const { name, kind, bin, contact } = req.body || {};
  if (!name) return res.status(400).json({ err: 'Укажите название контрагента' });
  try {
    const info = db.prepare('INSERT INTO counterparties (name, kind, bin, contact) VALUES (?,?,?,?)')
      .run(
        String(name).trim(),
        oneOf(kind, COUNTERPARTY_KINDS, 'контрагент'),
        String(bin || '').trim(),
        String(contact || '').trim()
      );
    const c = db.prepare('SELECT * FROM counterparties WHERE id = ?').get(info.lastInsertRowid);
    logAction(req, 'counterparty:create', 'Контрагент ' + c.name);
    emitUpdate('dictionary:update', { kind: 'counterparty', id: c.id });
    res.status(201).json(c);
  } catch (e) {
    res.status(409).json({ err: 'Такой контрагент уже есть' });
  }
});

// ============================================================
// ЗАВОЗ / ВЫВОЗ (operations)
// ============================================================
const OPERATION_SELECT = `
  SELECT o.*,
         cp.name AS counterparty_name,
         ow.name AS owner_name,
         rc.name AS recipient_name,
         wh.name AS warehouse_name,
         c.number AS container_number,
         c.type AS container_type,
         w.number AS wagon_number,
         u.name AS responsible_name,
         p.code AS pass_code,
         i.doc_no AS invoice_no,
         b.doc_no AS basis_doc_no,
         b.kind AS basis_kind
  FROM operations o
  LEFT JOIN counterparties cp ON cp.id = o.counterparty_id
  LEFT JOIN counterparties ow ON ow.id = o.owner_id
  LEFT JOIN counterparties rc ON rc.id = o.recipient_id
  LEFT JOIN warehouses wh ON wh.id = o.warehouse_id
  LEFT JOIN containers c ON c.id = o.container_id
  LEFT JOIN wagons w ON w.id = o.wagon_id
  LEFT JOIN users u ON u.id = o.responsible_id
  LEFT JOIN passes p ON p.id = o.pass_id
  LEFT JOIN invoices i ON i.id = o.invoice_id
  LEFT JOIN operations b ON b.id = o.basis_id
`;

function getOperation(id) {
  return db.prepare(OPERATION_SELECT + ' WHERE o.id = ?').get(Number(id));
}

app.get('/api/operations', authRequired, (req, res) => {
  const kind = req.query.kind;
  const status = req.query.status;
  const q = String(req.query.q || '').trim().toLowerCase();
  let sql = OPERATION_SELECT + ' WHERE 1 = 1';
  const params = [];
  if (OPERATION_KINDS.indexOf(kind) >= 0) { sql += ' AND o.kind = ?'; params.push(kind); }
  if (OPERATION_STATUSES.indexOf(status) >= 0) { sql += ' AND o.status = ?'; params.push(status); }
  if (q) {
    sql += " AND (LOWER(o.doc_no) LIKE ? OR LOWER(COALESCE(c.number,'')) LIKE ? OR LOWER(COALESCE(o.plate,'')) LIKE ? OR LOWER(COALESCE(o.driver,'')) LIKE ?)";
    const like = '%' + q + '%';
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY o.id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/operations/:id', authRequired, (req, res) => {
  const op = getOperation(req.params.id);
  if (!op) return res.status(404).json({ err: 'Документ не найден' });
  op.pass = op.pass_id ? db.prepare('SELECT * FROM passes WHERE id = ?').get(op.pass_id) : null;
  op.invoice = op.invoice_id ? db.prepare('SELECT * FROM invoices WHERE id = ?').get(op.invoice_id) : null;
  op.items = db.prepare('SELECT * FROM invoice_items WHERE operation_id = ?').all(op.id);
  res.json(op);
});

// Общие поля документа — используются и при создании, и при изменении.
const OPERATION_FIELDS = [
  'op_date', 'org', 'counterparty_id', 'owner_id', 'recipient_id', 'warehouse_id',
  'movement', 'transport_mode', 'cargo_status', 'status', 'container_id', 'container_category',
  'seal_no', 'plate', 'driver', 'wagon_id', 'wagon_kind', 'ignore_wagon', 'transferred',
  'basis_id', 'responsible_id', 'comment'
];

const OPERATION_REF_FIELDS = [
  'counterparty_id', 'owner_id', 'recipient_id', 'warehouse_id',
  'container_id', 'wagon_id', 'basis_id', 'responsible_id'
];

// Приведение полей документа к ожидаемым типам с проверкой по справочникам значений.
function normalizeOperationFields(raw, current) {
  const out = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (OPERATION_REF_FIELDS.indexOf(key) >= 0) out[key] = intOrNull(value);
    else if (key === 'status') out[key] = oneOf(value, OPERATION_STATUSES, current ? current.status : 'черновик');
    else if (key === 'transport_mode') out[key] = oneOf(value, TRANSPORT_MODES, current ? current.transport_mode : 'Автотранспортом');
    else if (key === 'cargo_status') out[key] = value ? oneOf(value, CARGO_STATUSES, CARGO_STATUSES[0]) : '';
    else if (key === 'ignore_wagon' || key === 'transferred') out[key] = value ? 1 : 0;
    else if (key === 'plate') out[key] = String(value || '').trim().toUpperCase();
    else out[key] = value === null ? '' : String(value);
  }
  return out;
}

app.post('/api/operations', authRequired, roleRequired('admin', 'dispatcher', 'receiver', 'guard', 'shift', 'ppjt'), (req, res) => {
  const body = req.body || {};
  const kind = oneOf(body.kind, OPERATION_KINDS, null);
  if (!kind) return res.status(400).json({ err: 'Тип документа должен быть «завоз» или «вывоз»' });

  const fields = normalizeOperationFields(pick(body, OPERATION_FIELDS), null);
  const basis = fields.basis_id ? db.prepare('SELECT * FROM operations WHERE id = ?').get(fields.basis_id) : null;
  if (fields.basis_id && !basis) return res.status(400).json({ err: 'Документ-основание не найден' });
  // Вывоз оформляется по завозу, поэтому основание обязано быть завозом.
  if (basis && basis.kind !== 'завоз') return res.status(400).json({ err: 'Документ-основание должен быть завозом' });

  const containerId = fields.container_id || (basis ? basis.container_id : null);
  const movement = fields.movement || (kind === 'завоз' ? 'Завоз гружёный' : 'Вывоз гружёный');

  const info = db.prepare(`
    INSERT INTO operations
      (doc_no, kind, op_date, org, counterparty_id, owner_id, recipient_id, warehouse_id, movement,
       transport_mode, cargo_status, status, container_id, container_category, seal_no, plate, driver, wagon_id,
       wagon_kind, ignore_wagon, transferred, basis_id, responsible_id, comment)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    docNo(kind),
    kind,
    String(fields.op_date || nowStamp()),
    String(fields.org || DEFAULT_ORG),
    fields.counterparty_id || null,
    fields.owner_id || null,
    fields.recipient_id || null,
    fields.warehouse_id || null,
    String(movement),
    fields.transport_mode || 'Автотранспортом',
    String(fields.cargo_status || (basis ? basis.cargo_status : '') || ''),
    fields.status || 'черновик',
    containerId || null,
    String(fields.container_category || (basis ? basis.container_category : '20 футовый')),
    String(fields.seal_no || ''),
    String(fields.plate || (basis ? basis.plate : '')),
    String(fields.driver || ''),
    fields.wagon_id || null,
    String(fields.wagon_kind || (basis ? basis.wagon_kind : '')),
    fields.ignore_wagon ? 1 : 0,
    fields.transferred ? 1 : 0,
    basis ? basis.id : null,
    fields.responsible_id || req.user.id,
    String(fields.comment || '')
  );

  const op = getOperation(info.lastInsertRowid);
  logAction(req, 'operation:create', op.kind + ' ' + op.doc_no + (op.container_number ? ' · ' + op.container_number : ''));
  emitUpdate('operation:update', op);
  res.status(201).json(op);
});

app.patch('/api/operations/:id', authRequired, roleRequired('admin', 'dispatcher', 'receiver', 'guard', 'shift', 'ppjt'), (req, res) => {
  const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(Number(req.params.id));
  if (!op) return res.status(404).json({ err: 'Документ не найден' });

  const normalized = normalizeOperationFields(pick(req.body || {}, OPERATION_FIELDS), op);
  const keys = Object.keys(normalized);
  if (!keys.length) return res.status(400).json({ err: 'Нет полей для изменения' });

  const setClause = keys.map((k) => k + ' = ?').join(', ');
  const values = keys.map((k) => normalized[k]);
  db.prepare(`UPDATE operations SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, op.id);

  const updated = getOperation(op.id);
  logAction(req, 'operation:update', updated.kind + ' ' + updated.doc_no + ' → ' + updated.status);
  emitUpdate('operation:update', updated);
  res.json(updated);
});

// «Ввести пропуск»: пропуск выпускается по документу и связывается с ним.
app.post('/api/operations/:id/pass', authRequired, roleRequired('admin', 'guard', 'dispatcher', 'shift'), (req, res) => {
  const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(Number(req.params.id));
  if (!op) return res.status(404).json({ err: 'Документ не найден' });
  if (op.pass_id) return res.json(db.prepare('SELECT * FROM passes WHERE id = ?').get(op.pass_id));
  if (!op.plate) return res.status(400).json({ err: 'В документе не указан госномер' });

  const code = docNo('пропуск');
  const info = db.prepare(
    "INSERT INTO passes (code, plate, type, operation_id, doc_date) VALUES (?,?,?,?,datetime('now'))"
  ).run(code, op.plate, oneOf(req.body && req.body.type, PASS_TYPES, 'разовый'), op.id);
  db.prepare("UPDATE operations SET pass_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(info.lastInsertRowid, op.id);

  const p = db.prepare('SELECT * FROM passes WHERE id = ?').get(info.lastInsertRowid);
  logAction(req, 'pass:create', 'Пропуск ' + p.code + ' для ' + p.plate + ' (' + op.doc_no + ')');
  emitUpdate('pass:update', p);
  emitUpdate('operation:update', getOperation(op.id));
  res.status(201).json(p);
});

// ============================================================
// РАСХОДНЫЕ НАКЛАДНЫЕ (шапка + строки)
// ============================================================
const INVOICE_SELECT = `
  SELECT i.*,
         rc.name AS recipient_name,
         ow.name AS owner_name,
         u.name AS responsible_name,
         (SELECT COUNT(*) FROM invoice_items it WHERE it.invoice_id = i.id) AS items_count,
         (SELECT COALESCE(SUM(it.qty), 0) FROM invoice_items it WHERE it.invoice_id = i.id) AS items_qty
  FROM invoices i
  LEFT JOIN counterparties rc ON rc.id = i.recipient_id
  LEFT JOIN counterparties ow ON ow.id = i.owner_id
  LEFT JOIN users u ON u.id = i.responsible_id
`;

const ITEM_SELECT = `
  SELECT it.*,
         wh.name AS warehouse_name,
         o.doc_no AS basis_doc_no,
         o.kind AS basis_kind,
         o.status AS basis_status
  FROM invoice_items it
  LEFT JOIN warehouses wh ON wh.id = it.warehouse_id
  LEFT JOIN operations o ON o.id = it.operation_id
`;

function getInvoice(id) {
  const inv = db.prepare(INVOICE_SELECT + ' WHERE i.id = ?').get(Number(id));
  if (!inv) return null;
  inv.items = db.prepare(ITEM_SELECT + ' WHERE it.invoice_id = ? ORDER BY it.id').all(inv.id);
  return inv;
}

// Строка накладной: если указан документ-основание (завоз), контейнер,
// категория и склад подтягиваются из него автоматически.
function insertInvoiceItem(invoiceId, raw) {
  const item = raw || {};
  const basisId = intOrNull(item.operation_id);
  const op = basisId ? db.prepare('SELECT * FROM operations WHERE id = ?').get(basisId) : null;
  const containerId = intOrNull(item.container_id) || (op ? op.container_id : null);
  const container = containerId ? db.prepare('SELECT * FROM containers WHERE id = ?').get(containerId) : null;
  const qty = Number(item.qty);
  const info = db.prepare(`
    INSERT INTO invoice_items
      (invoice_id, operation_id, container_id, container_number, cargo_kind, category, unit, qty, warehouse_id, comment)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    invoiceId,
    op ? op.id : null,
    containerId || null,
    String(item.container_number || (container ? container.number : '')).trim(),
    String(item.cargo_kind || 'Груженный контейнер'),
    String(item.category || (op ? op.container_category : '20 футовый')),
    String(item.unit || 'шт'),
    Number.isFinite(qty) && qty > 0 ? qty : 1,
    intOrNull(item.warehouse_id) || (op ? op.warehouse_id : null),
    String(item.comment || '')
  );
  return db.prepare(ITEM_SELECT + ' WHERE it.id = ?').get(info.lastInsertRowid);
}

app.get('/api/invoices', authRequired, (req, res) => {
  const rows = db.prepare(INVOICE_SELECT + ' ORDER BY i.id DESC LIMIT 200').all();
  if (String(req.query.full || '') === '1') {
    for (const row of rows) {
      row.items = db.prepare(ITEM_SELECT + ' WHERE it.invoice_id = ? ORDER BY it.id').all(row.id);
    }
  }
  res.json(rows);
});

app.get('/api/invoices/:id', authRequired, (req, res) => {
  const inv = getInvoice(req.params.id);
  if (!inv) return res.status(404).json({ err: 'Накладная не найдена' });
  res.json(inv);
});

const INVOICE_FIELDS = [
  'doc_date', 'org', 'recipient_id', 'owner_id', 'proxy_no', 'proxy_from', 'proxy_to',
  'proxy_person', 'proxy_individual', 'basis_doc', 'status', 'responsible_id', 'comment'
];
const INVOICE_REF_FIELDS = ['recipient_id', 'owner_id', 'responsible_id'];

function normalizeInvoiceFields(raw, current) {
  const out = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (INVOICE_REF_FIELDS.indexOf(key) >= 0) out[key] = intOrNull(value);
    else if (key === 'status') out[key] = oneOf(value, INVOICE_STATUSES, current ? current.status : 'черновик');
    else if (key === 'proxy_individual') out[key] = value ? 1 : 0;
    else out[key] = value === null ? '' : String(value);
  }
  return out;
}

app.post('/api/invoices', authRequired, roleRequired('admin', 'dispatcher', 'finance', 'shift'), (req, res) => {
  const body = req.body || {};
  const fields = normalizeInvoiceFields(pick(body, INVOICE_FIELDS), null);
  const items = Array.isArray(body.items) ? body.items : [];

  const invoiceId = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO invoices
        (doc_no, doc_date, org, recipient_id, owner_id, proxy_no, proxy_from, proxy_to,
         proxy_person, proxy_individual, basis_doc, status, responsible_id, comment)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      docNo('накладная'),
      String(fields.doc_date || nowStamp()),
      String(fields.org || DEFAULT_ORG),
      fields.recipient_id || null,
      fields.owner_id || null,
      String(fields.proxy_no || ''),
      String(fields.proxy_from || ''),
      String(fields.proxy_to || ''),
      String(fields.proxy_person || ''),
      fields.proxy_individual ? 1 : 0,
      String(fields.basis_doc || ''),
      fields.status || 'черновик',
      fields.responsible_id || req.user.id,
      String(fields.comment || '')
    );
    for (const item of items) insertInvoiceItem(info.lastInsertRowid, item);
    return info.lastInsertRowid;
  })();

  const inv = getInvoice(invoiceId);
  logAction(req, 'invoice:create', 'Расходная накладная ' + inv.doc_no + ' · строк: ' + inv.items.length);
  emitUpdate('invoice:update', inv);
  res.status(201).json(inv);
});

app.patch('/api/invoices/:id', authRequired, roleRequired('admin', 'dispatcher', 'finance', 'shift'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
  if (!inv) return res.status(404).json({ err: 'Накладная не найдена' });

  const normalized = normalizeInvoiceFields(pick(req.body || {}, INVOICE_FIELDS), inv);
  const keys = Object.keys(normalized);
  if (!keys.length) return res.status(400).json({ err: 'Нет полей для изменения' });

  const setClause = keys.map((k) => k + ' = ?').join(', ');
  const values = keys.map((k) => normalized[k]);
  db.prepare(`UPDATE invoices SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, inv.id);

  const updated = getInvoice(inv.id);
  logAction(req, 'invoice:update', 'Накладная ' + updated.doc_no + ' → ' + updated.status);
  emitUpdate('invoice:update', updated);
  res.json(updated);
});

app.post('/api/invoices/:id/items', authRequired, roleRequired('admin', 'dispatcher', 'shift'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
  if (!inv) return res.status(404).json({ err: 'Накладная не найдена' });
  const item = insertInvoiceItem(inv.id, req.body || {});
  logAction(req, 'invoice:item-add', 'Накладная ' + inv.doc_no + ' · ' + (item.container_number || 'строка ' + item.id));
  emitUpdate('invoice:update', getInvoice(inv.id));
  res.status(201).json(item);
});

// «Добавить из отпуска»: пакетно добавляем строки по выбранным документам завоза —
// контейнер, категория, склад и вид груза берутся из самого документа завоза.
app.post('/api/invoices/:id/items/bulk', authRequired, roleRequired('admin', 'dispatcher', 'shift'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
  if (!inv) return res.status(404).json({ err: 'Накладная не найдена' });
  const ids = Array.isArray(req.body && req.body.operation_ids)
    ? req.body.operation_ids.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    : [];
  if (!ids.length) return res.status(400).json({ err: 'Выберите документы завоза' });

  const added = db.transaction(() => {
    const out = [];
    for (const id of ids) {
      const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(id);
      if (!op || op.kind !== 'завоз') continue;
      out.push(insertInvoiceItem(inv.id, {
        operation_id: op.id,
        container_id: op.container_id,
        cargo_kind: op.cargo_status === 'Порожний' ? 'Порожний контейнер' : 'Груженный контейнер',
        category: op.container_category,
        unit: 'шт',
        qty: 1,
        warehouse_id: op.warehouse_id,
        comment: 'из завоза ' + op.doc_no
      }));
    }
    return out;
  })();

  if (!added.length) return res.status(400).json({ err: 'Подходящих документов завоза не найдено' });
  logAction(req, 'invoice:items-bulk', 'Накладная ' + inv.doc_no + ' · добавлено строк: ' + added.length);
  emitUpdate('invoice:update', getInvoice(inv.id));
  res.status(201).json({ added: added.length, items: added });
});

app.delete('/api/invoices/:id/items/:itemId', authRequired, roleRequired('admin', 'dispatcher', 'shift'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
  if (!inv) return res.status(404).json({ err: 'Накладная не найдена' });
  const info = db.prepare('DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?')
    .run(Number(req.params.itemId), inv.id);
  if (!info.changes) return res.status(404).json({ err: 'Строка не найдена' });
  logAction(req, 'invoice:item-delete', 'Накладная ' + inv.doc_no + ' · строка ' + req.params.itemId);
  emitUpdate('invoice:update', getInvoice(inv.id));
  res.json({ ok: true });
});

// «Создать вывоз по текущей строке»: из строки накладной рождается документ вывоза,
// документом-основанием которого выступает завоз этой строки.
app.post('/api/invoices/:id/items/:itemId/outbound', authRequired, roleRequired('admin', 'dispatcher', 'shift'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
  if (!inv) return res.status(404).json({ err: 'Накладная не найдена' });
  const item = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoice_id = ?')
    .get(Number(req.params.itemId), inv.id);
  if (!item) return res.status(404).json({ err: 'Строка не найдена' });

  const basis = item.operation_id
    ? db.prepare('SELECT * FROM operations WHERE id = ?').get(item.operation_id)
    : null;
  const body = req.body || {};

  const info = db.prepare(`
    INSERT INTO operations
      (doc_no, kind, op_date, org, counterparty_id, owner_id, recipient_id, warehouse_id, movement,
       transport_mode, cargo_status, status, container_id, container_category, seal_no, plate, driver, wagon_kind,
       basis_id, invoice_id, responsible_id, comment)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    docNo('вывоз'),
    'вывоз',
    nowStamp(),
    inv.org || DEFAULT_ORG,
    basis ? basis.counterparty_id : null,
    inv.owner_id || (basis ? basis.owner_id : null),
    inv.recipient_id || (basis ? basis.recipient_id : null),
    item.warehouse_id || (basis ? basis.warehouse_id : null),
    'Вывоз гружёный',
    basis ? basis.transport_mode : 'Автотранспортом',
    basis ? basis.cargo_status : '',
    'черновик',
    item.container_id || null,
    item.category || '20 футовый',
    '',
    String(body.plate || '').trim().toUpperCase(),
    String(body.driver || ''),
    basis ? basis.wagon_kind : '',
    basis ? basis.id : null,
    inv.id,
    intOrNull(body.responsible_id) || req.user.id,
    'Создано из накладной ' + inv.doc_no
  );

  const op = getOperation(info.lastInsertRowid);
  logAction(req, 'invoice:outbound', 'Вывоз ' + op.doc_no + ' из накладной ' + inv.doc_no);
  emitUpdate('operation:update', op);
  emitUpdate('invoice:update', getInvoice(inv.id));
  res.status(201).json(op);
});

// ---------- Обработка ошибок ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === 'Только изображения') return res.status(400).json({ err: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ err: 'Файл слишком большой (макс 5 МБ)' });
  res.status(500).json({ err: 'Внутренняя ошибка сервера' });
});

server.listen(PORT, HOST, () => {
  console.log('QazconHub Terminal server running on 0.0.0.0:' + PORT);
});
