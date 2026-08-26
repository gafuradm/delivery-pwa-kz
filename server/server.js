require('dotenv').config();
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
const JWT_SECRET = process.env.JWT_SECRET || 'qazconhub-terminal-secret-change-in-prod';

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
  res.json({ containers, containersFull, wagons, wagonsOnTrack, equipment, eqFree, vehicles, queue, requestsNew });
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
  const { plate, type } = req.body || {};
  if (!plate) return res.status(400).json({ err: 'Укажите госномер' });
  const code = 'PASS-' + Date.now().toString(36).toUpperCase();
  const info = db.prepare('INSERT INTO passes (code, plate, type) VALUES (?,?,?)')
    .run(code, String(plate).trim().toUpperCase(), String(type || 'разовый'));
  const p = db.prepare('SELECT * FROM passes WHERE id = ?').get(info.lastInsertRowid);
  logAction(req, 'pass:create', 'Пропуск ' + p.code + ' для ' + p.plate);
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

// ---------- UPLOAD ----------
app.post('/api/upload-photo', authRequired, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ err: 'Файл не загружен' });
  res.json({ url: '/uploads/' + req.file.filename });
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
