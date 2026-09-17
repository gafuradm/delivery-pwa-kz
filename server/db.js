const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Гарантируем существование директории БД — критично при деплое из чистого репозитория,
// где пустая папка server/db/ не хранится в git.
const dbDir = path.join(__dirname, 'db');
fs.mkdirSync(dbDir, { recursive: true });

// DB_PATH позволяет использовать отдельный файл БД (например, изолированный для
// smoke-тестов), не затрагивая рабочие данные. По умолчанию — server/db/terminal.db.
const dbFile = process.env.DB_PATH || path.join(dbDir, 'terminal.db');
if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
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

  -- Склады терминала (в образцах работы — «СПРЕЙДЕР»)
  CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    code TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  );

  -- Справочник участников сделки: организация / контрагент / собственник / получатель
  CREATE TABLE IF NOT EXISTS counterparties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    kind TEXT DEFAULT 'контрагент',
    bin TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  );

  -- Сквозная нумерация документов с ведущими нулями:
  -- Завоз 06859, Вывоз 000014639, Расходная накладная 000004853, Пропуск 000020129
  CREATE TABLE IF NOT EXISTS doc_seq (
    scope TEXT PRIMARY KEY,
    last_no INTEGER DEFAULT 0
  );

  -- Завоз / вывоз: документ, связывающий контейнер, транспорт, вагон, пропуск и накладную
  CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no TEXT NOT NULL,
    kind TEXT NOT NULL,
    op_date TEXT DEFAULT (datetime('now')),
    org TEXT DEFAULT '',
    counterparty_id INTEGER,
    owner_id INTEGER,
    recipient_id INTEGER,
    warehouse_id INTEGER,
    movement TEXT DEFAULT '',
    transport_mode TEXT DEFAULT 'Автотранспортом',
    status TEXT DEFAULT 'черновик',
    container_id INTEGER,
    container_category TEXT DEFAULT '20 футовый',
    seal_no TEXT DEFAULT '',
    plate TEXT DEFAULT '',
    driver TEXT DEFAULT '',
    wagon_id INTEGER,
    wagon_kind TEXT DEFAULT '',
    ignore_wagon INTEGER DEFAULT 0,
    pass_id INTEGER,
    invoice_id INTEGER,
    basis_id INTEGER,
    responsible_id INTEGER,
    comment TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (counterparty_id) REFERENCES counterparties(id),
    FOREIGN KEY (owner_id) REFERENCES counterparties(id),
    FOREIGN KEY (recipient_id) REFERENCES counterparties(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (container_id) REFERENCES containers(id),
    FOREIGN KEY (wagon_id) REFERENCES wagons(id),
    FOREIGN KEY (basis_id) REFERENCES operations(id),
    FOREIGN KEY (responsible_id) REFERENCES users(id)
  );

  -- Расходная накладная: шапка
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no TEXT NOT NULL,
    doc_date TEXT DEFAULT (datetime('now')),
    org TEXT DEFAULT '',
    recipient_id INTEGER,
    owner_id INTEGER,
    proxy_no TEXT DEFAULT '',
    proxy_from TEXT DEFAULT '',
    proxy_to TEXT DEFAULT '',
    proxy_person TEXT DEFAULT '',
    proxy_individual INTEGER DEFAULT 0,
    basis_doc TEXT DEFAULT '',
    status TEXT DEFAULT 'черновик',
    responsible_id INTEGER,
    comment TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (recipient_id) REFERENCES counterparties(id),
    FOREIGN KEY (owner_id) REFERENCES counterparties(id),
    FOREIGN KEY (responsible_id) REFERENCES users(id)
  );

  -- Строки расходной накладной: одна накладная — много контейнеров
  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    operation_id INTEGER,
    container_id INTEGER,
    container_number TEXT DEFAULT '',
    cargo_kind TEXT DEFAULT 'Груженный контейнер',
    category TEXT DEFAULT '20 футовый',
    unit TEXT DEFAULT 'шт',
    qty REAL DEFAULT 1,
    warehouse_id INTEGER,
    comment TEXT DEFAULT '',
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (operation_id) REFERENCES operations(id),
    FOREIGN KEY (container_id) REFERENCES containers(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  );

  CREATE INDEX IF NOT EXISTS idx_operations_kind ON operations(kind);
  CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
  CREATE INDEX IF NOT EXISTS idx_operations_basis ON operations(basis_id);
  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
`);

// ---------- Миграции ----------
// SQLite умеет только ADD COLUMN, поэтому новые поля добавляем только если их нет:
// повторный запуск на уже существующей базе не должен падать.
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Вид вагона и признак «Не учитывать вагон» — как в образцах работы
addColumn('wagons', 'wagon_kind', "TEXT DEFAULT ''");
addColumn('wagons', 'ignore_in_accounting', 'INTEGER DEFAULT 0');
// Пропуск, выпущенный по документу завоза/вывоза
addColumn('passes', 'operation_id', 'INTEGER');
addColumn('passes', 'doc_date', "TEXT DEFAULT ''");
// Связь журнала въезда/выезда с документом
addColumn('vehicles', 'operation_id', 'INTEGER');
// «Статус» груза в карточке документа (Порожний / Груженный) — поле из образца
addColumn('operations', 'cargo_status', "TEXT DEFAULT ''");
// Отметка «Передан» — из карточки вывоза на образце
addColumn('operations', 'transferred', 'INTEGER DEFAULT 0');

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

  // Склады терминала
  const whCount = db.prepare('SELECT COUNT(*) AS c FROM warehouses').get().c;
  if (whCount === 0) {
    const insertWh = db.prepare('INSERT INTO warehouses (name, code) VALUES (?,?)');
    insertWh.run('СПРЕЙДЕР', 'SPD');
    insertWh.run('Основной склад', 'MAIN');
    insertWh.run('Склад ВЭД', 'VED');
  }

  // Контрагенты: участники сделки из образцов работы
  const cpCount = db.prepare('SELECT COUNT(*) AS c FROM counterparties').get().c;
  if (cpCount === 0) {
    const insertCp = db.prepare('INSERT INTO counterparties (name, kind) VALUES (?,?)');
    insertCp.run('ТОО "International Logistics Corporation"', 'организация');
    insertCp.run('UNICO KAZAKHSTAN', 'собственник');
    insertCp.run('Xinjiang International Land Port Logistics Development', 'собственник');
    insertCp.run('WOOJIN GLOBAL LOGISTICS', 'собственник');
    insertCp.run('Sauran Solar Power', 'контрагент');
    insertCp.run('SANKARI MOTORS TOO', 'получатель');
    insertCp.run('GALANZ BOTTLERS AO', 'получатель');
  }

  // Нумерация продолжается с номеров, привычных терминалу
  const seqCount = db.prepare('SELECT COUNT(*) AS c FROM doc_seq').get().c;
  if (seqCount === 0) {
    const insertSeq = db.prepare('INSERT INTO doc_seq (scope, last_no) VALUES (?,?)');
    insertSeq.run('завоз', 6859);
    insertSeq.run('вывоз', 14639);
    insertSeq.run('накладная', 4853);
    insertSeq.run('пропуск', 20129);
  }
}
seed();

module.exports = db;
