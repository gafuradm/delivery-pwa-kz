/* Комплексное тестирование API QazconHub (smoke + RBAC)
 *
 * Тест СОЗДАЁТ записи и НЕ удаляет их за собой, поэтому прогонять его против рабочей
 * базы нельзя. Два безопасных способа:
 *   npm test                        # изолированный прогон: свой сервер на :8099 и /tmp-БД
 *   BASE_URL=https://<хост> npm run test:direct
 *
 * Прямой прогон против сервера по умолчанию (:8080 — рабочая БД) заблокирован;
 * осознанно разрешить запись в рабочую БД можно так: ALLOW_DIRTY_DB=1 npm run test:direct
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

  const isWorkDb = /^https?:\/\/(localhost|127\.0\.0\.1):8080\/?$/.test(BASE.trim());
  if (isWorkDb && process.env.ALLOW_DIRTY_DB !== '1') {
    console.error('\n⛔ Остановлено: тест пишет данные и не удаляет их за собой.');
    console.error(`   ${BASE} — это рабочий сервер (server/db/terminal.db).`);
    console.error('   Безопасный прогон:            npm test            # свой сервер на :8099 + временная БД');
    console.error('   Тест против другого сервера:  BASE_URL=http://host:port npm run test:direct');
    console.error('   Явно разрешить рабочую БД:    ALLOW_DIRTY_DB=1 npm run test:direct\n');
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
  // Нумерация пропусков сквозная и совпадает с журналом терминала (Пропуск 000020129)
  log(pCreate.status === 201 && /^\d{9}$/.test(String(pCode)), 'POST /api/passes (сквозной номер из 9 цифр)', `code=${pCode}`);
  const pBadType = await req('POST', '/api/passes', { token: T, body: { plate: 'Q' + TS, type: 'вечный' } });
  log(pBadType.status === 201 && pBadType.data?.type === 'разовый', 'Недопустимый тип пропуска → fallback «разовый»', `type=${pBadType.data?.type}`);

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

  console.log('\n===== 10. ДОКУМЕНТООБОРОТ: СПРАВОЧНИКИ, ЗАВОЗ/ВЫВОЗ, НАКЛАДНЫЕ =====');
  const dict = await req('GET', '/api/dictionaries', { token: T });
  const dictOk = dict.status === 200 && Array.isArray(dict.data?.warehouses) && dict.data.warehouses.length > 0
    && Array.isArray(dict.data?.counterparties) && Array.isArray(dict.data?.responsible);
  log(dictOk, 'GET /api/dictionaries (склады, контрагенты, ответственные)',
    `склады=${dict.data?.warehouses?.length}, контрагенты=${dict.data?.counterparties?.length}, сотрудники=${dict.data?.responsible?.length}`);
  log((dict.data?.operationStatuses || []).includes('черновик') && (dict.data?.transportModes || []).length > 0,
    'Справочник значений документа заполнен (статусы, вид транспорта)');
  const warehouses = dict.data?.warehouses || [];

  const whName = 'Склад ТЕСТ-' + TS;
  const whCreate = await req('POST', '/api/warehouses', { token: T, body: { name: whName, code: 'WH' + TS } });
  log(whCreate.status === 201 && whCreate.data?.id, 'POST /api/warehouses', `status=${whCreate.status}`);
  const whDup = await req('POST', '/api/warehouses', { token: T, body: { name: whName } });
  log(whDup.status === 409, 'Повторный склад → 409 (уникальность)', `status=${whDup.status}`);
  const whEmpty = await req('POST', '/api/warehouses', { token: T, body: { code: 'X' } });
  log(whEmpty.status === 400, 'POST /api/warehouses без названия → 400', `status=${whEmpty.status}`);

  const cpName = 'ТОО «ТЕСТ-' + TS + '»';
  const cpCreate = await req('POST', '/api/counterparties', { token: T, body: { name: cpName, kind: 'получатель', bin: '1234567' + TS } });
  log(cpCreate.status === 201 && cpCreate.data?.id, 'POST /api/counterparties', `status=${cpCreate.status}`);
  const cpId = cpCreate.data?.id;
  const cpBadKind = await req('POST', '/api/counterparties', { token: T, body: { name: 'Роль ТЕСТ-' + TS, kind: 'несуществующая' } });
  log(cpBadKind.status === 201 && cpBadKind.data?.kind === 'контрагент',
    'Неизвестная роль контрагента → fallback «контрагент»', `kind=${cpBadKind.data?.kind}`);

  // ---- Завоз ----
  const inCreate = await req('POST', '/api/operations', {
    token: T,
    body: {
      kind: 'завоз', movement: 'Завоз порожний', transport_mode: 'Железной дорогой',
      container_id: cId, container_category: '40 футовый', seal_no: '1234567',
      plate: vPlate, driver: 'ТЕСТ ВОДИТЕЛЬ',
      warehouse_id: whCreate.data?.id || warehouses[0]?.id,
      counterparty_id: cpId, owner_id: cpId, recipient_id: cpId, wagon_id: wId
    }
  });
  log(inCreate.status === 201 && /^\d{5}$/.test(String(inCreate.data?.doc_no)),
    'POST /api/operations «завоз» (номер из 5 цифр)', `doc_no=${inCreate.data?.doc_no}`);
  const inId = inCreate.data?.id;
  log(inCreate.data?.warehouse_name === whName && inCreate.data?.counterparty_name === cpName,
    'Завоз подтягивает названия справочников (JOIN)', `склад=${inCreate.data?.warehouse_name}`);
  log(inCreate.data?.container_number === cNum, 'Контейнер связан с документом завоза', `container=${inCreate.data?.container_number}`);
  log(inCreate.data?.status === 'черновик' && inCreate.data?.responsible_name === 'Администратор',
    'Документ получает статус «черновик» и ответственного по умолчанию', `responsible=${inCreate.data?.responsible_name}`);

  const badKind = await req('POST', '/api/operations', { token: T, body: { kind: 'перемещение' } });
  log(badKind.status === 400, 'Недопустимый тип документа → 400', `status=${badKind.status}`);
  const badBasis = await req('POST', '/api/operations', { token: T, body: { kind: 'вывоз', basis_id: 999999 } });
  log(badBasis.status === 400, 'Вывоз с несуществующим основанием → 400', `status=${badBasis.status}`);

  // ---- Пропуск по документу ----
  const opPass = await req('POST', `/api/operations/${inId}/pass`, { token: T, body: {} });
  log(opPass.status === 201 && /^\d{9}$/.test(String(opPass.data?.code)) && opPass.data?.operation_id === inId,
    'POST /api/operations/:id/pass (номер из 9 цифр, связь с документом)', `code=${opPass.data?.code}`);
  const opPassAgain = await req('POST', `/api/operations/${inId}/pass`, { token: T, body: {} });
  log(opPassAgain.status === 200 && opPassAgain.data?.id === opPass.data?.id,
    'Повторный пропуск по документу не создаётся', `status=${opPassAgain.status}`);

  const opCard = await req('GET', `/api/operations/${inId}`, { token: T });
  log(opCard.status === 200 && opCard.data?.pass?.code === opPass.data?.code,
    'GET /api/operations/:id отдаёт пропуск документа', `pass=${opCard.data?.pass?.code}`);

  const opPatch = await req('PATCH', `/api/operations/${inId}`, { token: T, body: { status: 'оформлен', comment: 'Проверено тестом' } });
  log(opPatch.status === 200 && opPatch.data?.status === 'оформлен', 'PATCH /api/operations/:id', `status=${opPatch.data?.status}`);
  const opPatchBad = await req('PATCH', `/api/operations/${inId}`, { token: T, body: { status: 'нет-такого' } });
  log(opPatchBad.status === 200 && opPatchBad.data?.status === 'оформлен',
    'Недопустимый статус документа не применяется', `status=${opPatchBad.data?.status}`);

  const opList = await req('GET', '/api/operations?kind=' + encodeURIComponent('завоз') + '&status=оформлен', { token: T });
  log(opList.status === 200 && opList.data.some((o) => o.id === inId), 'GET /api/operations?kind=&status= (фильтры)', `count=${opList.data?.length}`);
  const opSearch = await req('GET', '/api/operations?q=' + encodeURIComponent(cNum), { token: T });
  log(opSearch.status === 200 && opSearch.data.some((o) => o.id === inId), 'GET /api/operations?q= (поиск по контейнеру)', `count=${opSearch.data?.length}`);

  // ---- Расходная накладная ----
  const invCreate = await req('POST', '/api/invoices', {
    token: T,
    body: { recipient_id: cpId, owner_id: cpId, proxy_no: '0-06-01-08/' + TS, proxy_person: 'Тестов Т.Т.', items: [{ operation_id: inId, qty: 2 }] }
  });
  log(invCreate.status === 201 && /^\d{9}$/.test(String(invCreate.data?.doc_no)),
    'POST /api/invoices (номер из 9 цифр)', `doc_no=${invCreate.data?.doc_no}`);
  const invId = invCreate.data?.id;
  const firstItem = invCreate.data?.items?.[0];
  log(firstItem?.container_number === cNum && firstItem?.category === '40 футовый' && firstItem?.basis_doc_no === inCreate.data?.doc_no,
    'Строка накладной подтянула контейнер, категорию и основание', `container=${firstItem?.container_number}, category=${firstItem?.category}`);
  log(invCreate.data?.items_qty === 2, 'Количество по строкам суммируется', `items_qty=${invCreate.data?.items_qty}`);
  log(invCreate.data?.recipient_name === cpName, 'Получатель накладной подтянут из справочника', `recipient=${invCreate.data?.recipient_name}`);

  const itemAdd = await req('POST', `/api/invoices/${invId}/items`, { token: T, body: { operation_id: inId, qty: 3 } });
  log(itemAdd.status === 201 && itemAdd.data?.qty === 3, 'POST /api/invoices/:id/items', `status=${itemAdd.status}`);
  const invFull = await req('GET', '/api/invoices/' + invId, { token: T });
  log(invFull.status === 200 && invFull.data?.items?.length === 2 && invFull.data?.items_qty === 5,
    'GET /api/invoices/:id (строки и итог)', `строк=${invFull.data?.items?.length}, qty=${invFull.data?.items_qty}`);
  const invDelBad = await req('DELETE', `/api/invoices/${invId}/items/999999`, { token: T });
  log(invDelBad.status === 404, 'Удаление несуществующей строки → 404', `status=${invDelBad.status}`);

  // ---- Вывоз по строке накладной ----
  const outbound = await req('POST', `/api/invoices/${invId}/items/${itemAdd.data?.id}/outbound`, {
    token: T, body: { plate: '900 TEST 01', driver: 'ВЫВОЗ ВОДИТЕЛЬ' }
  });
  log(outbound.status === 201 && outbound.data?.kind === 'вывоз' && /^\d{9}$/.test(String(outbound.data?.doc_no)),
    'POST /api/invoices/:id/items/:itemId/outbound (вывоз)', `doc_no=${outbound.data?.doc_no}`);
  log(outbound.data?.basis_doc_no === inCreate.data?.doc_no && outbound.data?.invoice_no === invCreate.data?.doc_no,
    'Вывоз ссылается на завоз-основание и накладную', `basis=${outbound.data?.basis_doc_no}, invoice=${outbound.data?.invoice_no}`);
  log(outbound.data?.container_number === cNum && outbound.data?.container_category === '40 футовый',
    'Вывоз наследует контейнер и категорию строки', `container=${outbound.data?.container_number}`);
  log(outbound.data?.status === 'черновик' && outbound.data?.plate === '900 TEST 01',
    'Госномер вывоза нормализован, статус — черновик', `plate=${outbound.data?.plate}`);

  const invPatch = await req('PATCH', `/api/invoices/${invId}`, { token: T, body: { status: 'оформлена' } });
  log(invPatch.status === 200 && invPatch.data?.status === 'оформлена', 'PATCH /api/invoices/:id', `status=${invPatch.data?.status}`);
  const invTail = await req('GET', '/api/invoices?full=1', { token: T });
  log(invTail.status === 200 && (invTail.data || []).some((i) => i.id === invId && Array.isArray(i.items)),
    'GET /api/invoices?full=1 отдаёт строки', `count=${invTail.data?.length}`);

  const statsDocs = await req('GET', '/api/stats', { token: T });
  log(statsDocs.status === 200 && typeof statsDocs.data?.operationsOpen === 'number' && typeof statsDocs.data?.passesToday === 'number',
    'GET /api/stats содержит метрики документооборота', `open=${statsDocs.data?.operationsOpen}, passes=${statsDocs.data?.passesToday}`);

  console.log('\n===== 10.1. ПОЛЯ КАРТОЧКИ И «ДОБАВИТЬ ИЗ ОТПУСКА» =====');
  const dictCargo = await req('GET', '/api/dictionaries', { token: T });
  log(dictCargo.status === 200 && Array.isArray(dictCargo.data?.cargoStatuses) && dictCargo.data.cargoStatuses.includes('Порожний'),
    'GET /api/dictionaries отдаёт словарь «Статус» груза', `cargoStatuses=${JSON.stringify(dictCargo.data?.cargoStatuses)}`);

  const cardPatch = await req('PATCH', `/api/operations/${inId}`, {
    token: T,
    body: { cargo_status: 'Порожний', transferred: true, plate: '616 BCR05', transport_mode: 'Железной дорогой' }
  });
  log(cardPatch.status === 200 && cardPatch.data?.cargo_status === 'Порожний' && cardPatch.data?.transferred === 1
    && cardPatch.data?.plate === '616 BCR05' && cardPatch.data?.transport_mode === 'Железной дорогой',
    'PATCH карточки: «Статус» груза, «Передан», «Номер машины», «Способ тр-ки»',
    `cargo=${cardPatch.data?.cargo_status}, transferred=${cardPatch.data?.transferred}`);

  const cardPatchBad = await req('PATCH', `/api/operations/${inId}`, { token: T, body: { cargo_status: 'Что-то своё' } });
  log(cardPatchBad.status === 200 && cardPatchBad.data?.cargo_status === 'Порожний',
    'Недопустимый «Статус» груза → fallback «Порожний»', `cargo=${cardPatchBad.data?.cargo_status}`);

  const in2 = await req('POST', '/api/operations', {
    token: T,
    body: { kind: 'завоз', plate: '777 ABC 02', cargo_status: 'Груженный', container_id: cId }
  });
  const in2Id = in2.data?.id;
  log(in2.status === 201 && in2.data?.cargo_status === 'Груженный',
    'POST /api/operations с «Статусом» груза', `cargo=${in2.data?.cargo_status}`);

  const invBulk = await req('POST', '/api/invoices', { token: T, body: { proxy_person: 'Тестов Т.Т.', items: [] } });
  const invBulkId = invBulk.data?.id;
  log(invBulk.status === 201 && !!invBulkId, 'POST /api/invoices (пустая шапка под подбор строк)', `status=${invBulk.status}`);

  const bulkEmpty = await req('POST', `/api/invoices/${invBulkId}/items/bulk`, { token: T, body: { operation_ids: [] } });
  log(bulkEmpty.status === 400, '«Добавить из отпуска» без выбранных документов → 400', `status=${bulkEmpty.status}`);

  const bulk = await req('POST', `/api/invoices/${invBulkId}/items/bulk`, { token: T, body: { operation_ids: [inId, in2Id] } });
  log(bulk.status === 201 && bulk.data?.added === 2,
    'POST /api/invoices/:id/items/bulk («Добавить из отпуска»)', `added=${bulk.data?.added}`);

  const bulkCard = await req('GET', '/api/invoices/' + invBulkId, { token: T });
  log(bulkCard.status === 200 && bulkCard.data?.items?.length === 2
    && bulkCard.data.items.some((it) => it.cargo_kind === 'Порожний контейнер')
    && bulkCard.data.items.every((it) => !!it.basis_doc_no),
    'Строки подбора: вид груза и связь с документом основанием',
    `строк=${bulkCard.data?.items?.length}`);

  const bulkBad = await req('POST', `/api/invoices/${invBulkId}/items/bulk`, { token: T, body: { operation_ids: [999999] } });
  log(bulkBad.status === 400, '«Добавить из отпуска» по несуществующим документам → 400', `status=${bulkBad.status}`);

  const bulk404 = await req('POST', '/api/invoices/999999/items/bulk', { token: T, body: { operation_ids: [inId] } });
  log(bulk404.status === 404, '«Добавить из отпуска» в несуществующую накладную → 404', `status=${bulk404.status}`);

  console.log('\n===== 11. RBAC (разграничение доступа) =====');
  async function login(login, p) { const r = await req('POST', '/api/auth', { body: { login, pass: p } }); return r.data?.token; }
  const TG = await login('guard', 'guard123');
  const guardBulk = await req('POST', `/api/invoices/${invBulkId}/items/bulk`, { token: TG, body: { operation_ids: [] } });
  log(guardBulk.status === 403, 'guard НЕ может «Добавить из отпуска» → 403', `status=${guardBulk.status}`);
  const TC = await login('client', 'client123');
  const TD = await login('driver', 'driver123');
  const TF = await login('finance', 'fin123');
  log(!!TG && !!TC && !!TD && !!TF, 'Вход guard / client / driver / finance');

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

  // --- RBAC документооборота ---
  const guardInvoice = await req('POST', '/api/invoices', { token: TG, body: { items: [] } });
  log(guardInvoice.status === 403, 'guard НЕ может создавать накладные → 403', `status=${guardInvoice.status}`);

  const guardWarehouse = await req('POST', '/api/warehouses', { token: TG, body: { name: 'Склад RBAC-' + TS } });
  log(guardWarehouse.status === 403, 'guard НЕ может менять справочник складов → 403', `status=${guardWarehouse.status}`);

  // Начальник смены: контрагенты — можно, склады — нельзя (кнопки в UI скрыты по тому же признаку).
  const TSH = await login('shift', 'shift123');
  const shiftWarehouse = await req('POST', '/api/warehouses', { token: TSH, body: { name: 'Склад СМЕНА-' + TS } });
  log(shiftWarehouse.status === 403, 'shift НЕ может создавать склады → 403', `status=${shiftWarehouse.status}`);
  const shiftCounterparty = await req('POST', '/api/counterparties', { token: TSH, body: { name: 'ТОО «СМЕНА-' + TS + '»', kind: 'получатель' } });
  log(shiftCounterparty.status === 201, 'shift МОЖЕТ создавать контрагентов → 201', `status=${shiftCounterparty.status}`);

  const clientOps = await req('POST', '/api/operations', { token: TC, body: { kind: 'завоз' } });
  log(clientOps.status === 403, 'client НЕ может создавать завоз/вывоз → 403', `status=${clientOps.status}`);

  const clientDict = await req('GET', '/api/dictionaries', { token: TC });
  log(clientDict.status === 200, 'client видит справочники (роли, склады) → 200', `status=${clientDict.status}`);

  const financeOps = await req('POST', '/api/operations', { token: TF, body: { kind: 'завоз' } });
  log(financeOps.status === 403, 'finance НЕ может создавать завоз/вывоз → 403', `status=${financeOps.status}`);

  const financeInvoice = await req('POST', '/api/invoices', { token: TF, body: { items: [] } });
  log(financeInvoice.status === 201 && /^\d{9}$/.test(String(financeInvoice.data?.doc_no)),
    'finance МОЖЕТ создавать накладные → 201', `doc_no=${financeInvoice.data?.doc_no}`);

  const guardCard = await req('GET', '/api/operations/' + inId, { token: TG });
  log(guardCard.status === 200, 'guard видит карточку документа завоза → 200', `status=${guardCard.status}`);

  const driverPass = await req('POST', `/api/operations/${inId}/pass`, { token: TD, body: {} });
  log(driverPass.status === 403, 'driver НЕ может вводить пропуск → 403', `status=${driverPass.status}`);

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

  console.log('\n===== 12. ПРИБЫТИЕ ЖД ТРАНСПОРТОМ =====');
  const TR = await login('receiver', 'recv123');
  log(!!TR, 'Вход receiver (приёмосдатчик)');

  const dictRail = await req('GET', '/api/dictionaries', { token: T });
  log(dictRail.status === 200 && (dictRail.data?.railKinds || []).includes('Порожний')
    && (dictRail.data?.railStatuses || []).includes('оформлен'),
    'GET /api/dictionaries отдаёт словари реестра прибытия ЖД',
    `railKinds=${JSON.stringify(dictRail.data?.railKinds)}, railStatuses=${JSON.stringify(dictRail.data?.railStatuses)}`);

  const nowRail = new Date();
  const curYear = nowRail.getFullYear();
  const curMonth = nowRail.getMonth() + 1;
  const railCont = 'RAIL' + TS;
  const railWagon = 'WAGJ' + TS;

  const railCreate = await req('POST', '/api/rail-arrivals', {
    token: TR,
    body: {
      arrival_year: curYear, arrival_month: curMonth, arrival_time: '14:35', code: 'kzt-alm',
      wagon_number: railWagon, container_number: railCont.toLowerCase(), container_kind: '40',
      container_weight: 24.5, seal_doc: 'seal-001', seal_fact: 'seal-777',
      owner_id: cpId, recipient_id: cpId, gps_mark: 'gps-77', has_gps: 1,
      status: 'прибыл', comment: 'тестовая подача'
    }
  });
  log(railCreate.status === 201 && /^\d{5}$/.test(String(railCreate.data?.doc_no)),
    'POST /api/rail-arrivals (номер из 5 цифр)', `doc_no=${railCreate.data?.doc_no}`);
  const railId = railCreate.data?.id;
  log(railCreate.data?.arrival_year === curYear && railCreate.data?.arrival_month === curMonth
    && railCreate.data?.arrival_time === '14:35',
    'Период прибытия (месяц года) и время сохранены', `период=${railCreate.data?.arrival_month}.${railCreate.data?.arrival_year} ${railCreate.data?.arrival_time}`);
  log(railCreate.data?.container_number === railCont && railCreate.data?.code === 'KZT-ALM'
    && railCreate.data?.wagon_number === railWagon,
    'Номера контейнера/вагона и код нормализованы к верхнему регистру',
    `контейнер=${railCreate.data?.container_number}, код=${railCreate.data?.code}`);
  log(railCreate.data?.seal_mismatch === 1,
    'Расхождение пломб зафиксировано (документ ≠ факт)',
    `док=${railCreate.data?.seal_doc}, факт=${railCreate.data?.seal_fact}, mismatch=${railCreate.data?.seal_mismatch}`);
  log(railCreate.data?.has_gps === 1 && railCreate.data?.gps_mark === 'GPS-77'
    && railCreate.data?.owner_name === cpName && railCreate.data?.recipient_name === cpName,
    'Метка ГПС, собственник и грузополучатель подтянуты', `гпс=${railCreate.data?.gps_mark}, собственник=${railCreate.data?.owner_name}`);

  // Интеграция со справочниками: прибытие создаёт карточки контейнера и вагона
  const railContCard = (await req('GET', '/api/containers', { token: T })).data?.find((c) => c.number === railCont);
  log(!!railContCard && railContCard.size === '40' && railContCard.type === 'Гружёный' && railContCard.status === 'на_терминале',
    'Прибытие создало карточку контейнера (вид 40 → 40 футовый гружёный)',
    `контейнер=${railContCard?.number}, ${railContCard?.size}фт, ${railContCard?.type}`);
  const railWagonCard = (await req('GET', '/api/wagons', { token: T })).data?.find((w) => w.number === railWagon);
  log(!!railWagonCard && railWagonCard.operation === 'прибытие',
    'Прибытие создало карточку вагона', `вагон=${railWagonCard?.number}, операция=${railWagonCard?.operation}`);

  const railList = await req('GET', `/api/rail-arrivals?year=${curYear}&month=${curMonth}`, { token: T });
  const railSummary = railList.data?.summary || {};
  log(railList.status === 200 && (railList.data?.items || []).some((r) => r.id === railId),
    'GET /api/rail-arrivals?year&month (фильтр по месяцу года)', `записей=${railList.data?.items?.length}`);
  log(railSummary.total >= 1 && railSummary.mismatch >= 1 && railSummary.weight >= 24.5 && railSummary.withGps >= 1,
    'Сводка периода: количество, вес, расхождения пломб, метки ГПС',
    `всего=${railSummary.total}, вес=${railSummary.weight}, расхождения=${railSummary.mismatch}, ГПС=${railSummary.withGps}`);
  log((railSummary.byKind || {})['40'] >= 1, 'Сводка по видам к-ра', `byKind=${JSON.stringify(railSummary.byKind)}`);

  const railMismatchOnly = await req('GET', '/api/rail-arrivals?mismatch=1', { token: T });
  log(railMismatchOnly.status === 200 && (railMismatchOnly.data?.items || []).every((r) => r.seal_mismatch === 1)
    && (railMismatchOnly.data?.items || []).some((r) => r.id === railId),
    'Фильтр «только расхождения пломб»', `записей=${railMismatchOnly.data?.items?.length}`);

  const railSearch = await req('GET', '/api/rail-arrivals?q=' + railCont.toLowerCase(), { token: T });
  log(railSearch.status === 200 && (railSearch.data?.items || []).some((r) => r.id === railId),
    'Поиск по реестру (номер контейнера)', `найдено=${railSearch.data?.items?.length}`);

  const railCard = await req('GET', '/api/rail-arrivals/' + railId, { token: T });
  log(railCard.status === 200 && railCard.data?.id === railId, 'GET /api/rail-arrivals/:id', `status=${railCard.status}`);

  const railPatch = await req('PATCH', '/api/rail-arrivals/' + railId, {
    token: TR, body: { seal_fact: 'SEAL-001', status: 'оформлен', container_weight: 25 }
  });
  log(railPatch.status === 200 && railPatch.data?.seal_mismatch === 0 && railPatch.data?.status === 'оформлен'
    && railPatch.data?.container_weight === 25,
    'PATCH: сверка пломбы снимает расхождение, статус и вес обновляются',
    `mismatch=${railPatch.data?.seal_mismatch}, статус=${railPatch.data?.status}`);

  const railPatchPeriod = await req('PATCH', '/api/rail-arrivals/' + railId, { token: TR, body: { arrival_month: 13 } });
  log(railPatchPeriod.status === 200 && railPatchPeriod.data?.arrival_month === curMonth,
    'Недопустимый месяц → прежний период (валидация 1–12)', `месяц=${railPatchPeriod.data?.arrival_month}`);

  const railNoContainer = await req('POST', '/api/rail-arrivals', { token: TR, body: { code: 'X' + TS } });
  log(railNoContainer.status === 400, 'Запись без номера контейнера → 400', `status=${railNoContainer.status}`);

  const railGpsBad = await req('POST', '/api/rail-arrivals', {
    token: TR, body: { container_number: 'GPS' + TS, has_gps: 1 }
  });
  log(railGpsBad.status === 400, 'Метка ГПС без номера метки → 400', `status=${railGpsBad.status}`);

  const railPatch404 = await req('PATCH', '/api/rail-arrivals/999999', { token: T, body: { status: 'прибыл' } });
  log(railPatch404.status === 404, 'PATCH несуществующей записи → 404', `status=${railPatch404.status}`);

  const railStats = await req('GET', '/api/stats', { token: T });
  log(railStats.status === 200 && railStats.data?.railMonth >= 1
    && typeof railStats.data?.railToday === 'number' && typeof railStats.data?.railSealMismatch === 'number',
    'GET /api/stats содержит метрики прибытия ЖД',
    `за месяц=${railStats.data?.railMonth}, за сутки=${railStats.data?.railToday}, расхождения=${railStats.data?.railSealMismatch}`);

  const railReport = await req('GET', `/api/report/rail-arrivals?year=${curYear}&month=${curMonth}`, { token: T });
  log(railReport.status === 200 && railReport.ct.includes('application/pdf') && railReport.data?.length > 500,
    'GET /api/report/rail-arrivals (PDF-реестр за месяц)', `тип=${railReport.ct}, байт=${railReport.data?.length}`);

  // --- RBAC реестра прибытия ---
  const clientRail = await req('POST', '/api/rail-arrivals', { token: TC, body: { container_number: 'CL' + TS } });
  log(clientRail.status === 403, 'client НЕ может вносить прибытие ЖД → 403', `status=${clientRail.status}`);

  const driverRail = await req('POST', '/api/rail-arrivals', { token: TD, body: { container_number: 'DR' + TS } });
  log(driverRail.status === 403, 'driver НЕ может вносить прибытие ЖД → 403', `status=${driverRail.status}`);

  const guardRail = await req('POST', '/api/rail-arrivals', {
    token: TG, body: { container_number: 'GR' + TS, container_kind: 'Порожний', status: 'ожидается' }
  });
  log(guardRail.status === 201, 'guard МОЖЕТ зафиксировать подачу (как и завоз) → 201', `status=${guardRail.status}`);

  const guardRailDel = await req('DELETE', '/api/rail-arrivals/' + railId, { token: TG });
  log(guardRailDel.status === 403, 'guard НЕ может удалять записи реестра → 403', `status=${guardRailDel.status}`);

  const adminRailDel = await req('DELETE', '/api/rail-arrivals/' + (guardRail.data?.id || 999999), { token: T });
  log(adminRailDel.status === 200 && adminRailDel.data?.ok === true,
    'admin МОЖЕТ удалить ошибочную запись → 200', `status=${adminRailDel.status}`);

  const railGone = await req('GET', '/api/rail-arrivals/' + (guardRail.data?.id || 999999), { token: T });
  log(railGone.status === 404, 'Удалённая запись больше не читается → 404', `status=${railGone.status}`);

  console.log('\n========== ИТОГ ==========');
  console.log(`✅ Пройдено: ${pass}`);
  console.log(`❌ Провалено: ${fail}`);
  if (fail) console.log('\nПровалы:\n - ' + fails.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
