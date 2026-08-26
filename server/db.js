const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'db/terminal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Схема ----------
db.exec(`
  -- Пользователи и роли
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    terminal TEXT DEFAULT 'Основной',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Контейнеры
  CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    size TEXT DEFAULT '20',
    type TEXT DEFAULT 'Гружёный',
    status TEXT DEFAULT 'на_терминале',
    zone TEXT DEFAULT '',
    row TEXT DEFAULT '',
    stack TEXT DEFAULT '',
    tier TEXT DEFAULT '',
    client TEXT DEFAULT '',
    cargo TEXT DEFAULT '',
    weight REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Железнодорожные пути (ППЖТ)
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    capacity INTEGER DEFAULT 20,
    zone TEXT DEFAULT '',
    status TEXT DEFAULT 'свободен'
  );

  -- Вагоны
  CREATE TABLE IF NOT EXISTS wagons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    cargo TEXT DEFAULT '',
    owner TEXT DEFAULT '',
    track_id INTEGER,
    status TEXT DEFAULT 'на_пути',
    direction TEXT DEFAULT '',
    dest_station TEXT DEFAULT '',
    shipper TEXT DEFAULT '',
    operation TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (track_id) REFERENCES tracks(id)
  );

  -- Спецтехника
  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'Кран',
    plate TEXT DEFAULT '',
    status TEXT DEFAULT 'свободна',
    driver TEXT DEFAULT '',
    lat REAL DEFAULT 0,
    lon REAL DEFAULT 0,
    fuel REAL DEFAULT 100,
    hours REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Транспорт (въезд/выезд)
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL,
    type TEXT DEFAULT 'Грузовой',
    driver TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    direction TEXT DEFAULT 'въезд',
    status TEXT DEFAULT 'на_территории',
    time_in TEXT DEFAULT (datetime('now')),
    time_out TEXT,
    container_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (container_id) REFERENCES containers(id)
  );

  -- Заявки клиентов
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    client_name TEXT DEFAULT '',
    type TEXT DEFAULT 'контейнер',
    container_number TEXT DEFAULT '',
    cargo TEXT DEFAULT '',
    weight REAL DEFAULT 0,
    status TEXT DEFAULT 'новая',
    date_slot TEXT DEFAULT '',
    time_slot TEXT DEFAULT '',
    comment TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES users(id)
  );

  -- Электронная очередь (водители)
  CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL,
    driver TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    slot TEXT DEFAULT '',
    status TEXT DEFAULT 'ожидание',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Пропуска (охрана)
  CREATE TABLE IF NOT EXISTS passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    vehicle_id INTEGER,
    plate TEXT DEFAULT '',
    type TEXT DEFAULT 'разовый',
    status TEXT DEFAULT 'активен',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  );

  -- Журнал действий
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT DEFAULT '',
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ---------- Инициализация данных по умолчанию ----------
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (login, pass_hash, name, role) VALUES (?,?,?,?)'
    );
    const hash = (p) => bcrypt.hashSync(p, 10);
    const users = [
      ['admin', 'admin123', 'Администратор', 'admin'],
      ['director', 'director123', 'Директор', 'director'],
      ['dispatcher', 'disp123', 'Диспетчер', 'dispatcher'],
      ['ppjt', 'ppjt123', 'Диспетчер ППЖТ', 'ppjt'],
      ['receiver', 'recv123', 'Приёмосдатчик', 'receiver'],
      ['crane', 'crane123', 'Крановщик', 'crane'],
      ['store', 'store123', 'Кладовщик', 'store'],
      ['guard', 'guard123', 'Охрана', 'guard'],
      ['customs', 'customs123', 'Таможенный отдел', 'customs'],
      ['finance', 'fin123', 'Расчётный отдел', 'finance'],
      ['shift', 'shift123', 'Начальник смены', 'shift'],
      ['client', 'client123', 'Клиент', 'client'],
      ['driver', 'driver123', 'Водитель', 'driver']
    ];
    for (const [login, pass, name, role] of users) {
      insertUser.run(login, hash(pass), name, role);
    }
  }

  const trackCount = db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;
  if (trackCount === 0) {
    const insertTrack = db.prepare('INSERT INTO tracks (name, capacity, zone) VALUES (?,?,?)');
    insertTrack.run('Путь №1', 25, 'Зона А');
    insertTrack.run('Путь №2', 25, 'Зона А');
    insertTrack.run('Путь №3', 20, 'Зона Б');
    insertTrack.run('Путь №4', 20, 'Зона Б');
  }

  const eqCount = db.prepare('SELECT COUNT(*) AS c FROM equipment').get().c;
  if (eqCount === 0) {
    const insertEq = db.prepare('INSERT INTO equipment (name, type, plate, driver) VALUES (?,?,?,?)');
    insertEq.run('Кран КК-1', 'Козловой кран', 'KZ-CR-01', 'Аскар');
    insertEq.run('Кран КК-2', 'Козловой кран', 'KZ-CR-02', 'Бек');
    insertEq.run('Погрузчик П-1', 'Вилочный погрузчик', 'KZ-FL-01', 'Серик');
    insertEq.run('Тягач Т-1', 'Контейнеровоз', 'KZ-TR-01', 'Нурлан');
  }
}
seed();

module.exports = db;
