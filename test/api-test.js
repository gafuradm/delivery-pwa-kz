/* Комплексное тестирование API QazconHub (smoke + RBAC)
 *
 * Требуется запущенный сервер. Чтобы тестовые записи не попадали в рабочую базу,
 * запускайте сервер с отдельным файлом БД:
 *   DB_PATH=/tmp/qazconhub-test.db npm start &
 *   npm test                        # или BASE_URL=https://<хост> npm test
 */
const BASE = process.env.BASE_URL || 'http://localhost:8080';
let pass = 0, fail = 0;
const fails = [];

function log(ok, name, extra = '') {
  const mark = ok ? '✅' : '❌';
  if (ok) pass++; else { fail++; fails.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`${mark} ${name}${extra ? '  [' + extra + ']' : ''}`);
}

async function req(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form; // FormData — content-type ставится автоматически
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) { try { data = await res.json(); } catch { data = null; } }
  else { data = Buffer.from(await res.arrayBuffer()); }
  return { status: res.status, data, ct };
}

const TS = Date.now().toString().slice(-6);

(async () => {
  try {
    await fetch(BASE + '/api/stats');
  } catch (e) {
    console.error(`\n❌ Сервер недоступен по адресу ${BASE} (${e.cause?.code || e.message})`);
    console.error('   Запустите его командой npm start и повторите тест.\n');
    process.exit(2);
  }

  console.log(`\nБазовый адрес: ${BASE}`);
  console.log('\n===== 1. AUTH / СТАТИСТИКА =====');
  const noTok = await req('GET', '/api/stats');
  log(noTok.status === 401, 'GET /api/stats без токена → 401', `status=${noTok.status}`);

  const badTok = await req('GET', '/api/stats', { token: 'invalid.jwt.token' });
  log(badTok.status === 401, 'Недействительный токен → 401', `status=${badTok.status}`);

  const badLogin = await req('POST', '/api/auth', { body: { login: 'admin', pass: 'wrong' } });
  log(badLogin.status === 401, 'Неверный пароль → 401', `status=${badLogin.status}`);

  const admin = await req('POST', '/api/auth', { body: { login: 'admin', pass: 'admin123' } });
  const T = admin.data?.token;
  log(admin.status === 200 && !!T && admin.data?.user?.role === 'admin', 'Вход admin/admin123', `status=${admin.status}`);
  log(!!T && T.split('.').length === 3, 'JWT состоит из 3 частей');

  const roles = await req('GET', '/api/roles', { token: T });
  log(roles.status === 200 && roles.data?.admin === 'Администратор', 'GET /api/roles (13 ролей)', `keys=${roles.data ? Object.keys(roles.data).length : 0}`);

  const stats = await req('GET', '/api/stats', { token: T });
  log(stats.status === 200 && typeof stats.data?.containers === 'number',
    'GET /api/stats', `containers=${stats.data?.containers}, wagons=${stats.data?.wagons}`);

  console.log('\n===== 2. КОНТЕЙНЕРЫ =====');
  const cList = await req('GET', '/api/containers', { token: T });
  log(cList.status === 200 && Array.isArray(cList.data), 'GET /api/containers', `count=${cList.data?.length}`);

  const cNum = 'TEST' + TS;
  const cCreate = await req('POST', '/api/containers', { token: T, body: { number: cNum, size: '40', type: 'Гружёный', client: 'Тест', cargo: 'Товар', weight: 25000 } });
  log(cCreate.status === 201 && cCreate.data?.id, 'POST /api/containers', `status=${cCreate.status}`);
  const cId = cCreate.data?.id;

  const cDup = await req('POST', '/api/containers', { token: T, body: { number: cNum, size: '40' } });
  log(cDup.status === 409, 'Повторный номер → 409 (уникальность)', `status=${cDup.status}`);

  if (cId) {
    const cPatch = await req('PATCH', `/api/containers/${cId}`, { token: T, body: { status: 'на_терминале', zone: 'Зона А', row: 3, stack: 2, tier: 1 } });
    log(cPatch.status === 200 && cPatch.data?.zone === 'Зона А', 'PATCH /api/containers/:id', `status=${cPatch.status}`);
    const cPatch404 = await req('PATCH', '/api/containers/999999', { token: T, body: { status: 'x' } });
    log(cPatch404.status === 404, 'PATCH несуществующего контейнера → 404', `status=${cPatch404.status}`);
  }

  console.log('\n===== 3. ПУТИ / ВАГОНЫ =====');
  const tracks = await req('GET', '/api/tracks', { token: T });
  log(tracks.status === 200 && Array.isArray(tracks.data) && 'occupied' in (tracks.data[0] || {}),
    'GET /api/tracks (с вагонами и occupied)', `count=${tracks.data?.length}`);
  const trackId = tracks.data?.[0]?.id;
  const trackName = tracks.data?.[0]?.name;

  const tCreate = await req('POST', '/api/tracks', { token: T, body: { name: 'Путь ТЕСТ-' + TS, capacity: 15, zone: 'Зона В' } });
  log(tCreate.status === 201, 'POST /api/tracks', `status=${tCreate.status}`);

  const wList = await req('GET', '/api/wagons', { token: T });
  log(wList.status === 200 && Array.isArray(wList.data), 'GET /api/wagons', `count=${wList.data?.length}`);

  const wCreate = await req('POST', '/api/wagons', { token: T, body: { number: 'WAG' + TS, cargo: 'Уголь', owner: 'КТЖ', track_id: trackId, operation: 'прибытие' } });
  log(wCreate.status === 201 && wCreate.data?.id, 'POST /api/wagons', `status=${wCreate.status}`);
  const wId = wCreate.data?.id;
  if (wId) {
    const wPatch = await req('PATCH', `/api/wagons/${wId}`, { token: T, body: { status: 'на_пути' } });
    log(wPatch.status === 200 && wPatch.data?.status === 'на_пути', 'PATCH /api/wagons/:id', `status=${wPatch.status}`);

    // JOIN проверяем на только что созданном вагоне: на чистой БД список изначально пуст,
    // поэтому раньше проверка падала при отсутствии данных (тест зависел от прошлых прогонов).
    const wOwn = (await req('GET', '/api/wagons', { token: T })).data?.find((w) => w.id === wId);
    log(!!wOwn && wOwn.track_name === trackName, 'GET /api/wagons (JOIN track_name)', `track_name=${wOwn?.track_name}`);
  }

  console.log('\n===== 4. СПЕЦТЕХНИКА =====');
  const eqList = await req('GET', '/api/equipment', { token: T });
  log(eqList.status === 200 && Array.isArray(eqList.data), 'GET /api/equipment', `count=${eqList.data?.length}`);

  const eqCreate = await req('POST', '/api/equipment', { token: T, body: { name: 'Кран ТЕСТ-' + TS, type: 'Козловой кран', plate: 'KZ-TE-' + TS, driver: 'Тест' } });
  log(eqCreate.status === 201 && eqCreate.data?.id, 'POST /api/equipment', `status=${eqCreate.status}`);
  const eqId = eqCreate.data?.id;
  if (eqId) {
    const eqPatch = await req('PATCH', `/api/equipment/${eqId}`, { token: T, body: { status: 'свободна', fuel: 80 } });
    log(eqPatch.status === 200 && eqPatch.data?.fuel === 80, 'PATCH /api/equipment/:id', `status=${eqPatch.status}`);
  }

  console.log('\n===== 5. ТРАНСПОРТ (ВЪЕЗД/ВЫЕЗД) =====');
  const vList = await req('GET', '/api/vehicles', { token: T });
  log(vList.status === 200 && Array.isArray(vList.data), 'GET /api/vehicles', `count=${vList.data?.length}`);

  const vPlate = 'T' + TS;
  const vCreate = await req('POST', '/api/vehicles', { token: T, body: { plate: vPlate, type: 'Грузовой', driver: 'Тестер', purpose: 'Погрузка' } });
  log(vCreate.status === 201 && vCreate.data?.id, 'POST /api/vehicles (въезд)', `status=${vCreate.status}`);
  const vId = vCreate.data?.id;
  if (vId) {
    const vExit = await req('PATCH', `/api/vehicles/${vId}/exit`, { token: T });
    log(vExit.status === 200 && vExit.data?.status === 'выехал', 'PATCH /api/vehicles/:id/exit (выезд)', `status=${vExit.status}`);
  }

  console.log('\n===== 6. ЗАЯВКИ =====');
  const rList = await req('GET', '/api/requests', { token: T });
  log(rList.status === 200 && Array.isArray(rList.data), 'GET /api/requests (admin видит все)', `count=${rList.data?.length}`);

  const rCreate = await req('POST', '/api/requests', { token: T, body: { type: 'контейнер', container_number: 'REQ' + TS, cargo: 'Тест', weight: 1000, date_slot: '2026-09-20', time_slot: '10:00' } });
  log(rCreate.status === 201 && rCreate.data?.id, 'POST /api/requests', `status=${rCreate.status}`);
  const rId = rCreate.data?.id;
  if (rId) {
    const rPatch = await req('PATCH', `/api/requests/${rId}`, { token: T, body: { status: 'в_работе', comment: 'Обработано' } });
    log(rPatch.status === 200 && rPatch.data?.status === 'в_работе', 'PATCH /api/requests/:id', `status=${rPatch.status}`);
  }
  const rEmpty = await req('POST', '/api/requests', { token: T, body: { type: 'контейнер' } });
  log(rEmpty.status === 400, 'POST /api/requests без контейнера/груза → 400', `status=${rEmpty.status}`);

  console.log('\n===== 7. ОЧЕРЕДЬ =====');
  const qList = await req('GET', '/api/queue', { token: T });
  log(qList.status === 200 && Array.isArray(qList.data), 'GET /api/queue', `count=${qList.data?.length}`);

  const qCreate = await req('POST', '/api/queue', { token: T, body: { plate: 'Q' + TS, driver: 'Тестер', purpose: 'Выгрузка', slot: '11:00' } });
  log(qCreate.status === 201 && qCreate.data?.id, 'POST /api/queue', `status=${qCreate.status}`);
  const qId = qCreate.data?.id;
  if (qId) {
    const qPatch = await req('PATCH', `/api/queue/${qId}`, { token: T, body: { status: 'вызван', slot: '11:30' } });
    log(qPatch.status === 200 && qPatch.data?.status === 'вызван', 'PATCH /api/queue/:id', `status=${qPatch.status}`);
  }

  console.log('\n===== 8. ПРОПУСКА / OCR / ШЛАГБАУМ =====');
  const pList = await req('GET', '/api/passes', { token: T });
  log(pList.status === 200 && Array.isArray(pList.data), 'GET /api/passes', `count=${pList.data?.length}`);

  const pPlate = 'P' + TS;
  const pCreate = await req('POST', '/api/passes', { token: T, body: { plate: pPlate, type: 'разовый' } });
  const pCode = pCreate.data?.code;
  log(pCreate.status === 201 && String(pCode).startsWith('PASS-'), 'POST /api/passes (код PASS-XXX)', `code=${pCode}`);

  const ocrOk = await req('POST', '/api/ocr/recognize', { token: T, body: { plate: pPlate } });
  log(ocrOk.status === 200 && ocrOk.data?.allowed === true && ocrOk.data?.barrier === 'open',
    'OCR: активный пропуск → allowed=true, barrier=open', `status=${ocrOk.status}`);
  log(ocrOk.data?.recognized === true, 'OCR всегда возвращает recognized=true (номер распознан)');

  const ocrDeny = await req('POST', '/api/ocr/recognize', { token: T, body: { plate: 'UNKNOWN-999' } });
  log(ocrDeny.status === 200 && ocrDeny.data?.allowed === false && ocrDeny.data?.barrier === 'closed',
    'OCR: неизвестный номер → allowed=false, barrier=closed', `status=${ocrDeny.status}`);

  const barOpen = await req('POST', '/api/barrier/open', { token: T });
  log(barOpen.status === 200 && barOpen.data?.ok === true, 'POST /api/barrier/open', `status=${barOpen.status}`);
  const barBad = await req('POST', '/api/barrier/xyz', { token: T });
  log(barBad.status === 400, 'POST /api/barrier/неверное → 400', `status=${barBad.status}`);
  const barClose = await req('POST', '/api/barrier/close', { token: T });
  log(barClose.status === 200, 'POST /api/barrier/close', `status=${barClose.status}`);

  console.log('\n===== 9. ЖУРНАЛ / ОТЧЁТЫ / ЗАГРУЗКА =====');
  const audit = await req('GET', '/api/audit', { token: T });
  log(audit.status === 200 && Array.isArray(audit.data) && audit.data.length > 0, 'GET /api/audit (есть записи)', `count=${audit.data?.length}`);

  const repC = await req('GET', '/api/report/containers', { token: T });
  log(repC.status === 200 && repC.ct.includes('pdf') && repC.data?.[0] === 0x25, 'GET /api/report/containers (валидный PDF)', `status=${repC.status} bytes=${repC.data?.length}`);
  const repW = await req('GET', '/api/report/wagons', { token: T });
  log(repW.status === 200 && repW.ct.includes('pdf') && repW.data?.[0] === 0x25, 'GET /api/report/wagons (валидный PDF)', `status=${repW.status} bytes=${repW.data?.length}`);

  const emptyUpload = new FormData();
  const badUpload = await req('POST', '/api/upload-photo', { token: T, form: emptyUpload });
  log(badUpload.status === 400, 'POST /api/upload-photo без файла → 400', `status=${badUpload.status}`);

  // 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('photo', new Blob([png], { type: 'image/png' }), 'test.png');
  const okUpload = await req('POST', '/api/upload-photo', { token: T, form: fd });
  log(okUpload.status === 200 && String(okUpload.data?.url || '').startsWith('/uploads/'), 'POST /api/upload-photo (PNG) → {url}', `url=${okUpload.data?.url}`);

  const txt = new FormData();
  txt.append('photo', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'test.txt');
  const badType = await req('POST', '/api/upload-photo', { token: T, form: txt });
  log(badType.status === 400, 'POST /api/upload-photo (не изображение) → 400', `status=${badType.status}`);

  console.log('\n===== 10. RBAC (разграничение доступа) =====');
  async function login(login, p) { const r = await req('POST', '/api/auth', { body: { login, pass: p } }); return r.data?.token; }
  const TG = await login('guard', 'guard123');
  const TC = await login('client', 'client123');
  const TD = await login('driver', 'driver123');
  log(!!TG && !!TC && !!TD, 'Вход guard / client / driver');

  const guardWagon = await req('POST', '/api/wagons', { token: TG, body: { number: 'X' + TS } });
  log(guardWagon.status === 403, 'guard НЕ может создавать вагоны → 403', `status=${guardWagon.status}`);

  const guardAudit = await req('GET', '/api/audit', { token: TG });
  log(guardAudit.status === 403, 'guard НЕ имеет доступа к журналу → 403', `status=${guardAudit.status}`);

  const guardPass = await req('GET', '/api/passes', { token: TG });
  log(guardPass.status === 200, 'guard ИМЕЕТ доступ к пропускам → 200', `status=${guardPass.status}`);

  const clientPass = await req('GET', '/api/passes', { token: TC });
  log(clientPass.status === 403, 'client НЕ имеет доступа к пропускам → 403', `status=${clientPass.status}`);

  const clientContainer = await req('POST', '/api/containers', { token: TC, body: { number: 'C' + TS } });
  log(clientContainer.status === 403, 'client НЕ может создавать контейнеры → 403', `status=${clientContainer.status}`);

  const clientReport = await req('GET', '/api/report/containers', { token: TC });
  log(clientReport.status === 403, 'client НЕ имеет доступа к отчётам → 403', `status=${clientReport.status}`);

  const driverQueue = await req('POST', '/api/queue', { token: TD, body: { plate: 'D' + TS, driver: 'Водитель' } });
  log(driverQueue.status === 201, 'driver МОЖЕТ встать в очередь → 201', `status=${driverQueue.status}`);

  const driverWagon = await req('POST', '/api/wagons', { token: TD, body: { number: 'Y' + TS } });
  log(driverWagon.status === 403, 'driver НЕ может создавать вагоны → 403', `status=${driverWagon.status}`);

  // client видит только свои заявки
  const clientAuth = await req('POST', '/api/auth', { body: { login: 'client', pass: 'client123' } });
  const clientId = clientAuth.data?.user?.id;
  const clientReqs = await req('GET', '/api/requests', { token: TC });
  const onlyOwn = clientReqs.status === 200 && (clientReqs.data || []).every(r => r.client_id === clientId);
  log(onlyOwn, 'client видит ТОЛЬКО свои заявки (фильтр client_id)', `count=${clientReqs.data?.length}, client_id=${clientId}`);

  // client не может править чужую заявку
  if (rId) {
    const foreignPatch = await req('PATCH', `/api/requests/${rId}`, { token: TC, body: { status: 'x' } });
    log(foreignPatch.status === 403, 'client НЕ может править чужую заявку → 403', `status=${foreignPatch.status}`);
  }

  console.log('\n========== ИТОГ ==========');
  console.log(`✅ Пройдено: ${pass}`);
  console.log(`❌ Провалено: ${fail}`);
  if (fail) console.log('\nПровалы:\n - ' + fails.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
