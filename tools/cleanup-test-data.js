/* Очистка рабочей БД от артефактов автотестов (test/api-test.js).
 *
 * Зачем: `npm test` по умолчанию бьёт в BASE=http://localhost:8080, то есть в рабочую
 * БД (server/db/terminal.db). Тест не удаляет за собой записи, поэтому справочники и
 * документы постепенно засоряются маркерами ТЕСТ/TEST/REQ/WAG и т.п.
 *
 * Использование:
 *   node tools/cleanup-test-data.js                 # dry-run: только показать план
 *   node tools/cleanup-test-data.js --apply         # выполнить (с бэкапом БД рядом)
 *   DB_PATH=/path/to.db node tools/cleanup-test-data.js --apply
 *
 * Правила:
 *   • справочники — по маркерам теста (TEST*, WAG*, ТЕСТ-*, P/Q/T+цифры, REQ*);
 *   • документы (operations, invoices, invoice_items) — только созданные начиная
 *     с CUTOFF (до этой даты в рабочей БД лежат демо-данные сидов);
 *   • doc_seq откатывается до номеров, которые были до последнего прогона.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'db', 'terminal.db');
const CUTOFF = '2026-09-15 22:40:00'; // начало первого известного прогона тестов на рабочей БД

// Порядок важен: сначала зависимые строки (invoice_items → operations → invoices → справочники).
// «Документы» создаются тестом только в окне прогона — берём всё после CUTOFF.
const RULES = [
  ['invoice_items', `invoice_id IN (SELECT id FROM invoices WHERE created_at >= '${CUTOFF}')`],
  ['passes', `plate GLOB 'P[0-9]*' OR plate GLOB 'Q[0-9]*' OR plate GLOB 'T[0-9]*'`],
  ['vehicles', `driver = 'Тестер'`],
  ['operations', `created_at >= '${CUTOFF}'`],
  ['invoices', `created_at >= '${CUTOFF}'`],
  ['containers', `number LIKE 'TEST%' OR client IN ('Тест', 'Realtime')`],
  ['wagons', `number LIKE 'WAG%'`],
  ['tracks', `name LIKE 'Путь ТЕСТ-%'`],
  ['equipment', `name LIKE '%ТЕСТ-%' OR driver = 'Тест'`],
  ['counterparties', `name LIKE '%ТЕСТ-%' OR name LIKE '%СМЕНА-%'`],
  ['warehouses', `code LIKE 'WH%'`],
  ['queue', `plate GLOB 'Q[0-9]*' OR plate GLOB 'D[0-9]*'`],
  ['requests', `container_number LIKE 'REQ%'`],
  ['audit_log', `created_at >= '${CUTOFF}'`]
];

const SEQ_AFTER_CLEANUP = {
  'завоз': 6859,
  'вывоз': 14639,
  'накладная': 4853,
  'пропуск': 20129
};

const db = new Database(DB_PATH);
const plan = [];

for (const [table, where] of RULES) {
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all();
  plan.push({ table, where, rows });
}

const totalDocs = plan.filter((p) => ['operations', 'invoices', 'invoice_items'].includes(p.table))
  .reduce((n, p) => n + p.rows.length, 0);
const totalDicts = plan.filter((p) => !['operations', 'invoices', 'invoice_items', 'audit_log'].includes(p.table))
  .reduce((n, p) => n + p.rows.length, 0);
const totalLogs = (plan.find((p) => p.table === 'audit_log') || { rows: [] }).rows.length;

console.log(`БД: ${DB_PATH}`);
console.log(`Режим: ${APPLY ? 'ПРИМЕНЕНИЕ' : 'dry-run (показать план)'}`);
console.log(`Порог документов: created_at >= ${CUTOFF}\n`);

for (const { table, rows } of plan) {
  console.log(`${table}: ${rows.length}`);
  for (const r of rows.slice(0, 4)) {
    const label = r.doc_no || r.name || r.number || r.plate || r.container_number || r.code || r.detail || r.action || ('id=' + r.id);
    console.log(`   · #${r.id} ${label}${r.created_at ? '  (' + r.created_at + ')' : ''}`);
  }
  if (rows.length > 4) console.log(`   · … ещё ${rows.length - 4}`);
}

console.log(`\nИтого: документов ${totalDocs}, справочников ${totalDicts}, журнал ${totalLogs}, откат doc_seq:`,
  JSON.stringify(SEQ_AFTER_CLEANUP, null, 0));

if (!APPLY) {
  console.log('\nЭто dry-run. Для выполнения: node tools/cleanup-test-data.js --apply');
  db.close();
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backup = `${DB_PATH}.bak-${stamp}`;
db.backup(backup).then(() => {
  console.log(`\nБэкап: ${backup}`);
  const run = db.transaction(() => {
    // Проверку внешних ключей откладываем до COMMIT: документы ссылаются друг на друга.
    db.pragma('defer_foreign_keys = ON');
    for (const [table, where] of RULES) {
      db.prepare(`DELETE FROM ${table} WHERE ${where}`).run();
    }
    const upd = db.prepare('UPDATE doc_seq SET last_no = ? WHERE scope = ?');
    for (const [scope, no] of Object.entries(SEQ_AFTER_CLEANUP)) upd.run(no, scope);
  });
  run();
  console.log('Очистка выполнена.');
  for (const [table] of RULES) {
    console.log(`   ${table}: осталось ${db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c}`);
  }
  console.log('doc_seq:', JSON.stringify(db.prepare('SELECT * FROM doc_seq').all()));
  db.close();
}).catch((e) => {
  console.error('Ошибка бэкапа/очистки:', e.message);
  fs.existsSync(backup) && console.log('Бэкап создан частично:', backup);
  process.exit(1);
});
