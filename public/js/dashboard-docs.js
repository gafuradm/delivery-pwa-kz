// QazconHub Terminal — документооборот терминала (часть 3).
// Разделы «Завоз», «Вывоз», «Расходные накладные» и «Справочники» повторяют
// бумажные формы терминала: шапка документа, строки накладной, пропуск по
// документу и создание вывоза прямо из строки накладной.
(function () {
  'use strict';

  const core = window.__dashboardCore;
  if (!core) return;
  const { role, user, $, content, openModal, closeModal, render, switchView, VIEWS } = core;

  // ---------- Права на действия ----------
  const CAN_OPERATE = ['admin', 'dispatcher', 'receiver', 'guard', 'shift', 'ppjt'].includes(role);
  const CAN_ISSUE_PASS = ['admin', 'guard', 'dispatcher', 'shift'].includes(role);
  const CAN_INVOICE = ['admin', 'dispatcher', 'finance', 'shift'].includes(role);
  const CAN_INVOICE_ITEMS = ['admin', 'dispatcher', 'shift'].includes(role);
  // Склады и контрагенты имеют разный состав ролей на сервере
  // (POST /api/warehouses — admin/dispatcher, POST /api/counterparties — admin/dispatcher/shift).
  const CAN_WAREHOUSE = ['admin', 'dispatcher'].includes(role);
  const CAN_COUNTERPARTY = ['admin', 'dispatcher', 'shift'].includes(role);

  const CONTAINER_CATEGORIES = ['20 футовый', '40 футовый', '40 футовый HC', '45 футовый'];
  const CARGO_KINDS = ['Груженный контейнер', 'Порожний контейнер', 'Груженный контейнер (реф)'];
  // «Статус» груза в карточке документа — как в образце (Порожний / Груженный).
  const CARGO_STATUSES = ['Порожний', 'Груженный', 'Груженный (реф)'];

  // ---------- Кэш справочников ----------
  let dictCache = null;

  async function dictionaries(force) {
    if (!dictCache || force) dictCache = await API.get('/api/dictionaries');
    return dictCache;
  }

  // ---------- Мелкие помощники для разметки ----------
  function options(list, selectedId, emptyLabel) {
    const head = `<option value="">${esc(emptyLabel || '—')}</option>`;
    return head + (list || []).map((item) => {
      const label = item.name || item.label || item.number || item.code || ('#' + item.id);
      const sel = String(selectedId || '') === String(item.id) ? ' selected' : '';
      return `<option value="${item.id}"${sel}>${esc(label)}</option>`;
    }).join('');
  }

  function valueOptions(list, selected, emptyLabel) {
    const head = emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : '';
    return head + (list || []).map((v) => {
      const sel = String(selected || '') === String(v) ? ' selected' : '';
      return `<option value="${esc(v)}"${sel}>${esc(v)}</option>`;
    }).join('');
  }

  function field(label, inner) {
    return `<label class="field"><span>${esc(label)}</span>${inner}</label>`;
  }

  function val(id) {
    const el = $('#' + id);
    if (!el) return '';
    return el.type === 'checkbox' ? el.checked : el.value.trim();
  }

  function num(id) {
    const v = val(id);
    return v ? Number(v) : null;
  }

  function statusBadge(status, map) {
    return `<span class="badge ${statusClass(status)}">${esc(statusLabel(status, map))}</span>`;
  }

  // ============================================================
  // ЗАВОЗ И ВЫВОЗ
  // ============================================================
  async function viewOperations(kind) {
    const isInbound = kind === 'завоз';
    const state = { status: '', q: '' };

    async function load() {
      const params = ['kind=' + encodeURIComponent(kind)];
      if (state.status) params.push('status=' + encodeURIComponent(state.status));
      if (state.q) params.push('q=' + encodeURIComponent(state.q));
      return API.get('/api/operations?' + params.join('&'));
    }

    async function paint() {
      const [docs, dict] = await Promise.all([load(), dictionaries()]);
      const rows = docs.map((d) => `
        <tr>
          <td class="mono">${esc(d.doc_no)}</td>
          <td>${esc(stamp(d.op_date))}</td>
          <td>${esc(d.movement || '—')}</td>
          <td>${esc(d.transport_mode || '—')}</td>
          <td class="mono">${esc(d.container_number || '—')}</td>
          <td>${esc(d.container_category || '—')}</td>
          <td>${esc(d.cargo_status || '—')}</td>
          <td class="mono">${esc(d.plate || '—')}</td>
          <td>${esc(d.driver || '—')}</td>
          <td class="mono">${esc(d.wagon_number || '—')}</td>
          <td>${esc(d.warehouse_name || '—')}</td>
          <td>${esc(d.counterparty_name || '—')}</td>
          <td class="mono">${esc(d.pass_code || '—')}</td>
          <td class="mono">${esc(d.invoice_no || '—')}</td>
          <td>${statusBadge(d.status, OPERATION_STATUS)}</td>
          <td>
            <div class="panel-actions">
              <button class="btn btn-sm" data-card="${d.id}">Открыть</button>
              ${CAN_ISSUE_PASS ? `<button class="btn btn-sm" data-pass="${d.id}">Ввести пропуск</button>` : ''}
              ${CAN_OPERATE ? `<button class="btn btn-sm" data-status="${d.id}" data-current="${esc(d.status)}">Статус</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="16" class="empty">Документов пока нет</td></tr>`;

      content.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <h3>${isInbound ? 'Завоз на терминал' : 'Вывоз с терминала'} (${docs.length})</h3>
            <div class="panel-actions">
              <select class="input" id="opStatus" style="width:auto">
                <option value="">Все статусы</option>
                ${Object.keys(OPERATION_STATUS).map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${esc(OPERATION_STATUS[s])}</option>`).join('')}
              </select>
              <input class="input" id="opSearch" placeholder="Поиск: № документа, контейнер, номер" value="${esc(state.q)}" style="width:240px">
              ${CAN_OPERATE ? `<button class="btn btn-primary" id="opAdd">+ ${isInbound ? 'Завоз' : 'Вывоз'}</button>` : ''}
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr>
                <th>№ документа</th><th>Дата</th><th>Движение</th><th>Способ тр-ки</th><th>Контейнер</th>
                <th>Категория</th><th>Статус</th><th>Номер машины</th><th>Водитель</th><th>Вагон</th><th>Склад</th>
                <th>Контрагент</th><th>Пропуск</th><th>Расходная</th><th>Статус документа</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;

      $('#opStatus').addEventListener('change', (e) => { state.status = e.target.value; paint().catch(err); });
      $('#opSearch').addEventListener('change', (e) => { state.q = e.target.value.trim(); paint().catch(err); });
      if ($('#opAdd')) $('#opAdd').addEventListener('click', () => openOperationForm({ kind }));
      content.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => openOperationCard(b.dataset.card)));
      content.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => issuePass(b.dataset.pass)));
      content.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => changeOperationStatus(b.dataset.status, b.dataset.current)));
    }

    function err(e) { toast(e.message, 'err'); }
    await paint();
  }

// Карточка документа — редактируемая форма, как в образце: заголовок
  // «Заявка на завоз: Завоз 06861 от 16.09.2026 16:38:18», поля в порядке
  // образца и кнопки «ОК / Записать / Закрыть» плюс выпуск связанных документов.
  async function openOperationCard(id) {
    const [op, dict, containers, wagons] = await Promise.all([
      API.get('/api/operations/' + id),
      dictionaries(),
      API.get('/api/containers'),
      API.get('/api/wagons')
    ]);
    const isInbound = op.kind === 'завоз';
    const label = (isInbound ? 'Заявка на завоз: Завоз ' : 'Заявка на вывоз: Вывоз ') + op.doc_no;
    const passDate = op.pass && op.pass.doc_date ? stamp(op.pass.doc_date) : '';
    const invoiceDate = op.invoice && op.invoice.doc_date ? stamp(op.invoice.doc_date) : '';
    const basisDate = op.basis_date ? stamp(op.basis_date) : '';

    function cardPayload() {
      return {
        org: val('c_org'),
        counterparty_id: num('c_counterparty'),
        owner_id: num('c_owner'),
        recipient_id: num('c_recipient'),
        warehouse_id: num('c_warehouse'),
        container_id: num('c_container'),
        container_category: val('c_category'),
        cargo_status: val('c_cargo'),
        transport_mode: val('c_transport'),
        movement: val('c_movement'),
        plate: val('c_plate'),
        driver: val('c_driver'),
        seal_no: val('c_seal'),
        wagon_kind: val('c_wagon_kind'),
        wagon_id: num('c_wagon'),
        responsible_id: num('c_responsible'),
        comment: val('c_comment'),
        status: opStatusKey(val('c_status')),
        ignore_wagon: val('c_ignore_wagon'),
        transferred: val('c_transferred')
      };
    }

    async function save() {
      const updated = await API.patch('/api/operations/' + op.id, cardPayload());
      Object.assign(op, updated);
      toast('Документ ' + op.doc_no + ' записан', 'ok');
      return updated;
    }

    function draw() {
      openModal(`
        <h3>${esc(label)} от ${esc(stamp(op.op_date))} ${statusBadge(op.status, OPERATION_STATUS)}</h3>
        <form id="opCard">
          <div class="form-row">
            ${field('Номер', `<input value="${esc(op.doc_no)}" disabled>`)}
            ${field('от', `<input value="${esc(stamp(op.op_date))}" disabled>`)}
          </div>
          <div class="form-row">
            ${field('Организация', `<input id="c_org" value="${esc(op.org || dict.org || '')}">`)}
            ${field('Контрагент', `<select id="c_counterparty">${options(dict.counterparties, op.counterparty_id, '— не указан —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Собственник', `<select id="c_owner">${options(dict.counterparties, op.owner_id, '— не указан —')}</select>`)}
            ${field('Получатель', `<select id="c_recipient">${options(dict.counterparties, op.recipient_id, '— не указан —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Склад', `<select id="c_warehouse">${options(dict.warehouses, op.warehouse_id, '— не указан —')}</select>`)}
            ${field('Контейнер', `<select id="c_container">${options(containers, op.container_id, '— без контейнера —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Категория', `<select id="c_category">${valueOptions(CONTAINER_CATEGORIES, op.container_category)}</select>`)}
            ${field('Статус', `<select id="c_cargo">${valueOptions(dict.cargoStatuses || CARGO_STATUSES, op.cargo_status || '', '— не указан —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Способ тр-ки', `<select id="c_transport">${valueOptions(dict.transportModes, op.transport_mode)}</select>`)}
            ${field('Движение', `<input id="c_movement" value="${esc(op.movement || '')}">`)}
          </div>
          <div class="form-row">
            ${field('Номер машины', `<input id="c_plate" placeholder="616 BCR05" value="${esc(op.plate || '')}">`)}
            ${field('Водитель', `<input id="c_driver" placeholder="КОГАБАЕВ" value="${esc(op.driver || '')}">`)}
          </div>
          <div class="form-row">
            ${field('Номер пломбы', `<input id="c_seal" value="${esc(op.seal_no || '')}">`)}
            ${field('Вид вагона', `<input id="c_wagon_kind" placeholder="Фитинговая платформа" value="${esc(op.wagon_kind || '')}">`)}
          </div>
          <div class="form-row">
            ${field('Вагон', `<select id="c_wagon">${options(wagons, op.wagon_id, '— без вагона —')}</select>`)}
            ${field('Ответственный', `<select id="c_responsible">${options(dict.responsible, op.responsible_id || user.id, '— не указано —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Пропуск', `<div>${op.pass_code
              ? `<span class="mono">${esc(op.pass_code)}</span>${passDate ? ' от ' + esc(passDate) : ''}`
              : (CAN_ISSUE_PASS ? '<button type="button" class="btn btn-sm btn-primary" id="cardPass">Ввести пропуск</button>' : '<span class="muted">не оформлен</span>')}</div>`)}
            ${field('Расходная накладная', `<div>${op.invoice_no
              ? `<span class="mono">${esc(op.invoice_no)}</span>${invoiceDate ? ' от ' + esc(invoiceDate) : ''}`
              : (CAN_INVOICE ? '<button type="button" class="btn btn-sm btn-primary" id="cardInvoice">Ввести расходную накладную</button>' : '<span class="muted">не создана</span>')}</div>`)}
          </div>
          ${isInbound ? '' : field('Документ основание', `<div class="mono">${esc(op.basis_doc_no ? op.basis_kind + ' ' + op.basis_doc_no + (basisDate ? ' от ' + basisDate : '') : '—')}</div>`)}
          ${field('Комментарий', `<textarea id="c_comment" rows="2">${esc(op.comment || '')}</textarea>`)}
          <div class="form-row">
            ${field('Статус документа', `<select id="c_status">${valueOptions(Object.keys(OPERATION_STATUS).map((s) => OPERATION_STATUS[s]), OPERATION_STATUS[op.status] || '')}</select>`)}
            ${field('Не учитывать вагон', '<label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="c_ignore_wagon" style="width:auto"' + (op.ignore_wagon ? ' checked' : '') + '> Не учитывать вагон</label>')}
          </div>
          ${isInbound ? '' : field('Передан', '<label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="c_transferred" style="width:auto"' + (op.transferred ? ' checked' : '') + '> Передан</label>')}
          <div class="modal-actions">
            ${CAN_OPERATE && isInbound ? '<button type="button" class="btn btn-success" id="cardOutbound">Создать вывоз по завозу</button>' : ''}
            <button type="submit" class="btn btn-primary">ОК</button>
            <button type="button" class="btn" id="cardSave">Записать</button>
            <button type="button" class="btn" data-close>Закрыть</button>
          </div>
        </form>
      `);

      // Роли без права правки документов видят карточку только для чтения.
      if (!CAN_OPERATE) {
        ['c_org', 'c_movement', 'c_plate', 'c_driver', 'c_seal', 'c_wagon_kind', 'c_counterparty',
          'c_owner', 'c_recipient', 'c_warehouse', 'c_container', 'c_category', 'c_cargo', 'c_transport',
          'c_wagon', 'c_responsible', 'c_status', 'c_ignore_wagon', 'c_transferred', 'c_comment']
          .forEach((f) => { if ($('#' + f)) $('#' + f).disabled = true; });
      }

      $('#opCard').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await save();
          closeModal();
          render();
        } catch (err) { toast(err.message, 'err'); }
      });

      $('#cardSave').addEventListener('click', async () => {
        try {
          await save();
          draw();
        } catch (err) { toast(err.message, 'err'); }
      });

      if ($('#cardPass')) $('#cardPass').addEventListener('click', async () => {
        try {
          const p = await API.post('/api/operations/' + op.id + '/pass', {});
          op.pass_id = p.id;
          op.pass_code = p.code;
          op.pass = p;
          toast('Пропуск ' + p.code + ' оформлен', 'ok');
          draw();
        } catch (err) { toast(err.message, 'err'); }
      });

      if ($('#cardInvoice')) $('#cardInvoice').addEventListener('click', () => {
        openInvoiceForm({ operation: op });
      });

      if ($('#cardOutbound')) $('#cardOutbound').addEventListener('click', () => {
        closeModal();
        openOperationForm({ kind: 'вывоз', basis: op, containerId: op.container_id });
      });
    }

    draw();
  }

  // Обратное преобразование подписи статуса документа в его ключ.
  function opStatusKey(label) {
    const found = Object.keys(OPERATION_STATUS).find((k) => OPERATION_STATUS[k] === label);
    return found || 'черновик';
  }

// Форма создания документа завоза/вывоза: порядок и подписи полей — как в образце.
  async function openOperationForm(opts) {
    const prefill = opts || {};
    const [dict, containers, wagons] = await Promise.all([
      dictionaries(),
      API.get('/api/containers'),
      API.get('/api/wagons')
    ]);
    const kind = prefill.kind || 'завоз';
    const basis = prefill.basis || null;
    const isInbound = kind === 'завоз';

    let inboundDocs = [];
    if (!isInbound) {
      inboundDocs = await API.get('/api/operations?kind=' + encodeURIComponent('завоз'));
    }

    openModal(`
      <h3>${isInbound ? 'Новый завоз' : 'Новый вывоз'}</h3>
      <form id="opForm">
        <div class="form-row">
          ${field('Дата документа', `<input id="op_date" type="date" value="${esc(((basis && basis.op_date) || new Date().toISOString()).slice(0, 10))}">`)}
          ${field('Организация', `<input id="op_org" value="${esc((basis && basis.org) || dict.org || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Контрагент', `<select id="op_counterparty">${options(dict.counterparties, (basis && basis.counterparty_id) || null, '— не указан —')}</select>`)}
          ${field('Собственник', `<select id="op_owner">${options(dict.counterparties, (basis && basis.owner_id) || null, '— не указан —')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Получатель', `<select id="op_recipient">${options(dict.counterparties, (basis && basis.recipient_id) || null, '— не указан —')}</select>`)}
          ${field('Склад', `<select id="op_warehouse">${options(dict.warehouses, (basis && basis.warehouse_id) || null, '— не указан —')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Контейнер', `<select id="op_container">${options(containers, (basis && basis.container_id) || prefill.containerId, '— без контейнера —')}</select>`)}
          ${field('Категория', `<select id="op_category">${valueOptions(CONTAINER_CATEGORIES, (basis && basis.container_category) || '20 футовый')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Статус', `<select id="op_cargo">${valueOptions(dict.cargoStatuses || CARGO_STATUSES, (basis && basis.cargo_status) || '', '— не указан —')}</select>`)}
          ${field('Способ тр-ки', `<select id="op_transport">${valueOptions(dict.transportModes, (basis && basis.transport_mode) || 'Автотранспортом')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Движение', `<input id="op_movement" value="${esc((basis && basis.movement) || (isInbound ? 'Завоз гружёный' : 'Вывоз гружёный'))}">`)}
          ${field('Номер машины', `<input id="op_plate" placeholder="616 BCR05" value="${esc((basis && basis.plate) || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Водитель', `<input id="op_driver" placeholder="КОГАБАЕВ" value="${esc((basis && basis.driver) || '')}">`)}
          ${field('Номер пломбы', `<input id="op_seal" value="${esc((basis && basis.seal_no) || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Вид вагона', `<input id="op_wagon_kind" placeholder="Фитинговая платформа" value="${esc((basis && basis.wagon_kind) || '')}">`)}
          ${field('Вагон', `<select id="op_wagon">${options(wagons, (basis && basis.wagon_id) || null, '— без вагона —')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Ответственный', `<select id="op_responsible">${options(dict.responsible, user.id, '— не указано —')}</select>`)}
          ${field('Не учитывать вагон', '<label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="op_ignore_wagon" style="width:auto"' + (basis && basis.ignore_wagon ? ' checked' : '') + '> Не учитывать вагон</label>')}
        </div>
        ${isInbound ? '' : field('Документ основание (завоз)', `<select id="op_basis">${options(inboundDocs.map((d) => ({ id: d.id, name: d.doc_no + ' · ' + (d.container_number || d.movement || '') })), basis ? basis.id : null, '— без основания —')}</select>`)}
        ${isInbound ? '' : field('Передан', '<label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="op_transferred" style="width:auto"> Передан</label>')}
        ${field('Комментарий', `<textarea id="op_comment" rows="2">${esc((basis && basis.comment) || '')}</textarea>`)}
        <label class="field"><span>&nbsp;</span>
          <label style="display:flex;align-items:center;gap:8px;font-size:14px">
            <input type="checkbox" id="op_make_pass" style="width:auto"> Сразу оформить пропуск
          </label>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Отмена</button>
          <button type="submit" class="btn btn-primary">Создать документ</button>
        </div>
      </form>
    `);

    $('#opForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          kind,
          op_date: withTime(val('op_date')),
          org: val('op_org'),
          movement: val('op_movement'),
          transport_mode: val('op_transport'),
          cargo_status: val('op_cargo'),
          container_id: num('op_container'),
          container_category: val('op_category'),
          seal_no: val('op_seal'),
          plate: val('op_plate'),
          driver: val('op_driver'),
          wagon_id: num('op_wagon'),
          wagon_kind: val('op_wagon_kind'),
          warehouse_id: num('op_warehouse'),
          counterparty_id: num('op_counterparty'),
          owner_id: num('op_owner'),
          recipient_id: num('op_recipient'),
          responsible_id: num('op_responsible'),
          basis_id: isInbound ? null : num('op_basis'),
          ignore_wagon: val('op_ignore_wagon'),
          transferred: val('op_transferred'),
          comment: val('op_comment')
        };
        const created = await API.post('/api/operations', payload);
        if (val('op_make_pass') && created.plate) {
          await API.post('/api/operations/' + created.id + '/pass', {});
        }
        closeModal();
        toast('Документ ' + created.doc_no + ' создан', 'ok');
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

  async function changeOperationStatus(id, current) {
    const next = prompt('Новый статус документа:', current || 'черновик');
    if (!next) return;
    try {
      await API.patch('/api/operations/' + id, { status: next });
      toast('Статус обновлён', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function issuePass(id) {
    try {
      const p = await API.post('/api/operations/' + id + '/pass', {});
      toast('Пропуск ' + p.code + ' оформлен', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  // ============================================================
  // РАСХОДНЫЕ НАКЛАДНЫЕ
  // ============================================================
  async function viewInvoices() {
    const [invoices, dict] = await Promise.all([API.get('/api/invoices'), dictionaries()]);

    content.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>Расходные накладные (${invoices.length})</h3>
          <div class="panel-actions">
            ${CAN_INVOICE ? '<button class="btn btn-primary" id="invAdd">+ Новая накладная</button>' : ''}
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>№ документа</th><th>Дата</th><th>Организация</th><th>Код получателя</th>
              <th>Собственник</th><th>Доверенность</th><th>Строк</th><th>Кол-во</th><th>Статус</th><th></th>
            </tr></thead>
            <tbody>
              ${invoices.map((i) => `
                <tr>
                  <td class="mono">${esc(i.doc_no)}</td>
                  <td>${esc((i.doc_date || '').slice(0, 16))}</td>
                  <td>${esc(i.org || '—')}</td>
                  <td>${esc(i.recipient_name || refName(dict.counterparties, i.recipient_id))}</td>
                  <td>${esc(i.owner_name || refName(dict.counterparties, i.owner_id))}</td>
                  <td class="mono">${esc(i.proxy_no || '—')}</td>
                  <td>${i.items_count}</td>
                  <td>${i.items_qty}</td>
                  <td>${statusBadge(i.status, INVOICE_STATUS)}</td>
                  <td><button class="btn btn-sm" data-card="${i.id}">Открыть</button></td>
                </tr>
              `).join('') || '<tr><td colspan="10" class="empty">Накладных пока нет</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if ($('#invAdd')) $('#invAdd').addEventListener('click', () => openInvoiceForm({}));
    content.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => openInvoiceCard(b.dataset.card)));
  }

// Форма накладной: шапка (с «Через кого» и «Физ лицо») и первая строка.
  async function openInvoiceForm(opts) {
    const setup = opts || {};
    const dict = await dictionaries();
    const op = setup.operation || null;

    openModal(`
      <h3>Новая расходная накладная</h3>
      <form id="invForm">
        <div class="form-row">
          ${field('Дата документа', `<input id="inv_date" type="date" value="${esc(new Date().toISOString().slice(0, 10))}">`)}
          ${field('Организация', `<input id="inv_org" value="${esc(dict.org || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Получатель', `<select id="inv_recipient">${options(dict.counterparties, (op && op.recipient_id) || null, '— не указан —')}</select>`)}
          ${field('Собственник', `<select id="inv_owner">${options(dict.counterparties, (op && op.owner_id) || null, '— не указан —')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Доверенность №', `<input id="inv_proxy_no" placeholder="0-06-01-08/07">`)}
          ${field('Действует с', `<input id="inv_proxy_from" type="date">`)}
        </div>
        <div class="form-row">
          ${field('Действует по', `<input id="inv_proxy_to" type="date">`)}
          ${field('Через кого', `<input id="inv_proxy_person" placeholder="Бейсенбеков Б.Ж.">`)}
        </div>
        <div class="form-row">
          ${field('Физ лицо', '<label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="inv_individual" style="width:auto"> Физ лицо</label>')}
          ${field('Ответственный', `<select id="inv_responsible">${options(dict.responsible, user.id, '— не указано —')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Документ основание', `<input id="inv_basis_doc" placeholder="Договор / заявка" value="${esc(op ? op.doc_no : '')}">`)}
          ${field('Статус', `<select id="inv_status">${valueOptions(Object.keys(INVOICE_STATUS).map((s) => INVOICE_STATUS[s]), INVOICE_STATUS['черновик'])}</select>`)}
        </div>
        ${field('Комментарий', '<textarea id="inv_comment" rows="2"></textarea>')}
        <h4 style="margin:6px 0 10px;color:var(--sidebar)">Строка накладной</h4>
        ${op
          ? field('Документ завоза', `<input value="${esc(op.doc_no)}" disabled>`)
          : field('Документ завоза (основание строки)', `<select id="inv_basis">${options((await API.get('/api/operations?kind=' + encodeURIComponent('завоз'))).map((d) => ({ id: d.id, name: d.doc_no + ' · ' + (d.container_number || d.movement || '') })), null, '— без основания —')}</select>`)}
        <div class="form-row">
          ${field('Груз', `<select id="inv_cargo_kind">${valueOptions(CARGO_KINDS, 'Груженный контейнер')}</select>`)}
          ${field('Категория', `<select id="inv_category">${valueOptions(CONTAINER_CATEGORIES, (op && op.container_category) || '20 футовый')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Ед. изм.', `<select id="inv_unit">${valueOptions(['шт', 'т', 'м³'], 'шт')}</select>`)}
          ${field('Количество', `<input id="inv_qty" type="number" min="1" step="1" value="1">`)}
        </div>
        ${field('Склад', `<select id="inv_warehouse">${options(dict.warehouses, (op && op.warehouse_id) || null, '— не указан —')}</select>`)}
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Отмена</button>
          <button type="submit" class="btn btn-primary">Создать накладную</button>
        </div>
      </form>
    `);

    $('#invForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const item = {
          qty: num('inv_qty') || 1,
          cargo_kind: val('inv_cargo_kind'),
          category: val('inv_category'),
          unit: val('inv_unit'),
          warehouse_id: num('inv_warehouse'),
          operation_id: op ? op.id : num('inv_basis')
        };
        const created = await API.post('/api/invoices', {
          doc_date: withTime(val('inv_date')),
          org: val('inv_org'),
          recipient_id: num('inv_recipient'),
          owner_id: num('inv_owner'),
          proxy_no: val('inv_proxy_no'),
          proxy_from: val('inv_proxy_from'),
          proxy_to: val('inv_proxy_to'),
          proxy_person: val('inv_proxy_person'),
          proxy_individual: val('inv_individual'),
          basis_doc: val('inv_basis_doc'),
          status: invStatusKey(val('inv_status')),
          responsible_id: num('inv_responsible'),
          comment: val('inv_comment'),
          items: [item]
        });
        closeModal();
        toast('Накладная ' + created.doc_no + ' создана', 'ok');
        render();
        openInvoiceCard(created.id);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

  function invStatusKey(label) {
    const found = Object.keys(INVOICE_STATUS).find((k) => INVOICE_STATUS[k] === label);
    return found || 'черновик';
  }

// «Добавить из завоза»: строка накладной по одному выбранному документу завоза.
  async function addItemsFromInbound(inv) {
    const inbound = await API.get('/api/operations?kind=' + encodeURIComponent('завоз'));
    openModal(`
      <h3>Добавить из завоза</h3>
      <form id="fromInbound">
        ${field('Документ завоза', `<select id="fi_op">${options(inbound.map((d) => ({ id: d.id, name: d.doc_no + ' · ' + (d.container_number || d.movement || '') })), null, '— выберите документ —')}</select>`)}
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Отмена</button>
          <button type="submit" class="btn btn-primary">Добавить строку</button>
        </div>
      </form>
    `);

    $('#fromInbound').addEventListener('submit', async (e) => {
      e.preventDefault();
      const opId = num('fi_op');
      if (!opId) return toast('Выберите документ завоза', 'err');
      try {
        await API.post('/api/invoices/' + inv.id + '/items', { operation_id: opId, qty: 1, unit: 'шт' });
        closeModal();
        toast('Строка добавлена', 'ok');
        render();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  // «Добавить из отпуска»: пакетно добавляем строки по отмеченным завозам —
  // контейнер, склад и вид груза берутся из самого документа завоза.
  async function addItemsBulk(inv, dict) {
    const inbound = await API.get('/api/operations?kind=' + encodeURIComponent('завоз'));
    openModal(`
      <h3>Добавить из отпуска</h3>
      <p class="muted">Отметьте документы завоза — строки накладной сформируются автоматически.</p>
      <div class="form-row">
        ${field('Склад', `<select id="ib_wh">${options(dict.warehouses, null, '— все склады —')}</select>`)}
        ${field('Документов завоза', `<input value="${inbound.length}" disabled>`)}
      </div>
      <div class="table-wrap" style="max-height:320px;overflow:auto">
        <table class="table">
          <thead><tr><th></th><th>Документ основание</th><th>Номер тр. средства</th><th>Склад</th><th>Статус</th></tr></thead>
          <tbody id="ibRows">
            ${inbound.map((d) => `
              <tr data-wh="${esc(d.warehouse_id || '')}">
                <td><input type="checkbox" class="ib-pick" value="${d.id}" style="width:auto"></td>
                <td class="mono">${esc(d.doc_no)}</td>
                <td class="mono">${esc(d.container_number || '—')}</td>
                <td>${esc(d.warehouse_name || refName(dict.warehouses, d.warehouse_id))}</td>
                <td>${esc(d.cargo_status || '—')}</td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="empty">Завозов нет</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Отмена</button>
        <button type="button" class="btn btn-primary" id="ibSubmit">Добавить отмеченные</button>
      </div>
    `);

    $('#ib_wh').addEventListener('change', () => {
      const wh = val('ib_wh');
      document.querySelectorAll('#ibRows tr[data-wh]').forEach((tr) => {
        tr.style.display = !wh || tr.dataset.wh === wh ? '' : 'none';
      });
    });

    $('#ibSubmit').addEventListener('click', async () => {
      const ids = Array.from(document.querySelectorAll('.ib-pick:checked')).map((c) => Number(c.value));
      if (!ids.length) return toast('Отметьте хотя бы один документ', 'err');
      try {
        const res = await API.post('/api/invoices/' + inv.id + '/items/bulk', { operation_ids: ids });
        closeModal();
        toast('Добавлено строк: ' + res.added, 'ok');
        render();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  // Карточка накладной: редактируемая шапка (ОК / Записать / Закрыть),
  // строки с кнопкой «Создать вывоз по текущей строке» и подбор строк.
  async function openInvoiceCard(id) {
    const [inv, dict] = await Promise.all([API.get('/api/invoices/' + id), dictionaries()]);
    const canItems = CAN_INVOICE_ITEMS;

    async function save() {
      const updated = await API.patch('/api/invoices/' + inv.id, {
        org: val('i_org'),
        recipient_id: num('i_recipient'),
        owner_id: num('i_owner'),
        proxy_no: val('i_proxy_no'),
        proxy_from: val('i_proxy_from'),
        proxy_to: val('i_proxy_to'),
        proxy_person: val('i_proxy_person'),
        proxy_individual: val('i_individual'),
        basis_doc: val('i_basis_doc'),
        status: invStatusKey(val('i_status')),
        responsible_id: num('i_responsible'),
        comment: val('i_comment')
      });
      Object.assign(inv, updated);
      toast('Накладная ' + inv.doc_no + ' записана', 'ok');
      return updated;
    }

    function draw() {
      openModal(`
        <h3>Расходная накладная № ${esc(inv.doc_no)} от ${esc(stamp(inv.doc_date))} ${statusBadge(inv.status, INVOICE_STATUS)}</h3>
        <form id="invCard">
          <div class="form-row">
            ${field('Организация', `<input id="i_org" value="${esc(inv.org || dict.org || '')}">`)}
            ${field('Получатель', `<select id="i_recipient">${options(dict.counterparties, inv.recipient_id, '— не указан —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Собственник', `<select id="i_owner">${options(dict.counterparties, inv.owner_id, '— не указан —')}</select>`)}
            ${field('Документ основание', `<input id="i_basis_doc" value="${esc(inv.basis_doc || '')}">`)}
          </div>
          <div class="form-row">
            ${field('Доверенность №', `<input id="i_proxy_no" value="${esc(inv.proxy_no || '')}">`)}
            ${field('Действует с', `<input id="i_proxy_from" value="${esc(inv.proxy_from || '')}">`)}
          </div>
          <div class="form-row">
            ${field('Действует по', `<input id="i_proxy_to" value="${esc(inv.proxy_to || '')}">`)}
            ${field('Через кого', `<input id="i_proxy_person" placeholder="Бейсенбеков Б.Ж." value="${esc(inv.proxy_person || '')}">`)}
          </div>
          <div class="form-row">
            ${field('Физ лицо', '<label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="i_individual" style="width:auto"' + (inv.proxy_individual ? ' checked' : '') + '> Физ лицо</label>')}
            ${field('Ответственный', `<select id="i_responsible">${options(dict.responsible, inv.responsible_id || user.id, '— не указано —')}</select>`)}
          </div>
          <div class="form-row">
            ${field('Статус', `<select id="i_status">${valueOptions(Object.keys(INVOICE_STATUS).map((s) => INVOICE_STATUS[s]), INVOICE_STATUS[inv.status] || '')}</select>`)}
            ${field('Строк', `<input value="${inv.items.length}" disabled>`)}
          </div>
          ${field('Комментарий', `<textarea id="i_comment" rows="2">${esc(inv.comment || '')}</textarea>`)}
        </form>
        <div class="panel-head">
          <h3>Строки (${inv.items.length})</h3>
          <div class="panel-actions">
            ${canItems ? '<button class="btn btn-sm" id="itemsFromStock">Добавить из отпуска</button>' : ''}
            ${canItems ? '<button class="btn btn-sm" id="itemsFromInbound">Добавить из завоза</button>' : ''}
            ${canItems ? '<button class="btn btn-sm btn-primary" id="itemAdd">+ Строка</button>' : ''}
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>№</th><th>Документ основание</th><th>Груз</th><th>Номер тр. средства</th><th>Ед. изм.</th><th>Количество</th><th>Склад</th><th>Категория</th><th></th></tr></thead>
            <tbody>
              ${inv.items.map((it, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td class="mono">${esc(it.basis_doc_no || '—')}</td>
                  <td>${esc(it.cargo_kind || '—')}</td>
                  <td class="mono">${esc(it.container_number || '—')}</td>
                  <td>${esc(it.unit || 'шт')}</td>
                  <td>${it.qty}</td>
                  <td>${esc(it.warehouse_name || refName(dict.warehouses, it.warehouse_id))}</td>
                  <td>${esc(it.category || '—')}</td>
                  <td>
                    <div class="panel-actions">
                      ${canItems ? `<button class="btn btn-sm btn-success" data-out="${it.id}">Создать вывоз по текущей строке</button>` : ''}
                      ${canItems ? `<button class="btn btn-sm btn-danger" data-del="${it.id}">Удалить</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') || `<tr><td colspan="9" class="empty">Строк нет</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary" form="invCard">ОК</button>
          <button type="button" class="btn" id="invSave">Записать</button>
          <button type="button" class="btn" data-close>Закрыть</button>
        </div>
      `);

      if (!CAN_INVOICE) {
        ['i_org', 'i_recipient', 'i_owner', 'i_proxy_no', 'i_proxy_from', 'i_proxy_to',
          'i_proxy_person', 'i_individual', 'i_basis_doc', 'i_status', 'i_responsible', 'i_comment']
          .forEach((f) => { if ($('#' + f)) $('#' + f).disabled = true; });
      }

      $('#invCard').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await save();
          closeModal();
          render();
        } catch (err) { toast(err.message, 'err'); }
      });

      $('#invSave').addEventListener('click', async () => {
        try {
          await save();
          draw();
        } catch (err) { toast(err.message, 'err'); }
      });

      if ($('#itemsFromInbound')) $('#itemsFromInbound').addEventListener('click', () => addItemsFromInbound(inv));
      if ($('#itemsFromStock')) $('#itemsFromStock').addEventListener('click', () => addItemsBulk(inv, dict));
      if ($('#itemAdd')) $('#itemAdd').addEventListener('click', () => addItemForm(inv));
      document.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => outboundForm(inv, b.dataset.out)));
      document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await API.del('/api/invoices/' + inv.id + '/items/' + b.dataset.del);
          inv.items = inv.items.filter((it) => String(it.id) !== String(b.dataset.del));
          draw();
          toast('Строка удалена', 'ok');
        } catch (err) { toast(err.message, 'err'); }
      }));
    }

    draw();
  }

// Добавление строки в существующую накладную.
  async function addItemForm(inv) {
    const [dict, inbound] = await Promise.all([
      dictionaries(),
      API.get('/api/operations?kind=' + encodeURIComponent('завоз'))
    ]);
    openModal(`
      <h3>Строка накладной № ${esc(inv.doc_no)}</h3>
      <form id="itemForm">
        ${field('Документ основание (завоз)', `<select id="it_basis">${options(inbound.map((d) => ({ id: d.id, name: d.doc_no + ' · ' + (d.container_number || d.movement || '') })), null, '— без основания —')}</select>`)}
        <div class="form-row">
          ${field('Груз', `<select id="it_cargo_kind">${valueOptions(CARGO_KINDS, 'Груженный контейнер')}</select>`)}
          ${field('Категория', `<select id="it_category">${valueOptions(CONTAINER_CATEGORIES, '20 футовый')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Ед. изм.', `<select id="it_unit">${valueOptions(['шт', 'т', 'м³'], 'шт')}</select>`)}
          ${field('Количество', `<input id="it_qty" type="number" min="1" step="1" value="1">`)}
        </div>
        ${field('Склад', `<select id="it_warehouse">${options(dict.warehouses, null, '— не указан —')}</select>`)}
        ${field('Номер тр. средства', `<input id="it_container" placeholder="подставится из документа завоза">`)}
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Отмена</button>
          <button type="submit" class="btn btn-primary">Добавить строку</button>
        </div>
      </form>
    `);

    $('#itemForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.post('/api/invoices/' + inv.id + '/items', {
          operation_id: num('it_basis'),
          cargo_kind: val('it_cargo_kind'),
          category: val('it_category'),
          unit: val('it_unit'),
          qty: num('it_qty') || 1,
          warehouse_id: num('it_warehouse'),
          container_number: val('it_container')
        });
        closeModal();
        toast('Строка добавлена', 'ok');
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

// «Создать вывоз по текущей строке» — из строки накладной рождается документ вывоза.
  async function outboundForm(inv, itemId) {
    const item = inv.items.find((it) => String(it.id) === String(itemId));
    openModal(`
      <h3>Вывоз по строке накладной № ${esc(inv.doc_no)}</h3>
      <p class="muted">Номер тр. средства: <span class="mono">${esc(item && item.container_number ? item.container_number : 'не указан')}</span> · Документ основание: <span class="mono">${esc(item && item.basis_doc_no ? item.basis_doc_no : '—')}</span></p>
      <form id="outForm">
        ${field('Номер машины', '<input id="out_plate" placeholder="616 BCR05" required>')}
        ${field('Водитель', '<input id="out_driver" placeholder="КОГАБАЕВ">')}
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Отмена</button>
          <button type="submit" class="btn btn-success">Создать вывоз по текущей строке</button>
        </div>
      </form>
    `);

    $('#outForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const op = await API.post('/api/invoices/' + inv.id + '/items/' + itemId + '/outbound', {
          plate: val('out_plate'),
          driver: val('out_driver')
        });
        closeModal();
        toast('Вывоз ' + op.doc_no + ' создан', 'ok');
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

  // СПРАВОЧНИКИ
  // ============================================================
  async function viewDictionaries() {
    const dict = await dictionaries(true);

    content.innerHTML = `
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
        <div class="panel">
          <div class="panel-head"><h3>Склады (${dict.warehouses.length})</h3>
            ${CAN_WAREHOUSE ? '<button class="btn btn-sm btn-primary" id="whAdd">+ Склад</button>' : ''}
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Название</th><th>Код</th></tr></thead>
              <tbody>${dict.warehouses.map((w) => `<tr><td>${esc(w.name)}</td><td class="mono">${esc(w.code || '—')}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Пусто</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Контрагенты (${dict.counterparties.length})</h3>
            ${CAN_COUNTERPARTY ? '<button class="btn btn-sm btn-primary" id="cpAdd">+ Контрагент</button>' : ''}
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Название</th><th>Роль</th><th>БИН</th></tr></thead>
              <tbody>${dict.counterparties.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.kind)}</td><td class="mono">${esc(c.bin || '—')}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Пусто</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Ответственные лица (${dict.responsible.length})</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>ФИО</th><th>Роль</th><th>Id</th></tr></thead>
            <tbody>${dict.responsible.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(ROLE_LABELS[u.role] || u.role)}</td><td class="mono">${u.id}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Пусто</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

    if ($('#whAdd')) $('#whAdd').addEventListener('click', () => {
      openModal(`
        <h3>Новый склад</h3>
        <form id="whForm">
          ${field('Название *', '<input id="wh_name" required placeholder="СПРЕЙДЕР">')}
          ${field('Код', '<input id="wh_code" placeholder="SPD">')}
          <div class="modal-actions">
            <button type="button" class="btn" data-close>Отмена</button>
            <button type="submit" class="btn btn-primary">Сохранить</button>
          </div>
        </form>
      `);
      $('#whForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/warehouses', { name: val('wh_name'), code: val('wh_code') });
          dictCache = null;
          closeModal();
          toast('Склад добавлен', 'ok');
          render();
        } catch (err) { toast(err.message, 'err'); }
      });
    });

    if ($('#cpAdd')) $('#cpAdd').addEventListener('click', () => {
      openModal(`
        <h3>Новый контрагент</h3>
        <form id="cpForm">
          ${field('Название *', '<input id="cp_name" required placeholder="ТОО «...»">')}
          ${field('Роль в документе', `<select id="cp_kind">${valueOptions(dict.counterpartyKinds, 'контрагент')}</select>`)}
          <div class="form-row">
            ${field('БИН', '<input id="cp_bin" placeholder="123456789012">')}
            ${field('Контакт', '<input id="cp_contact" placeholder="+7 ...">')}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" data-close>Отмена</button>
            <button type="submit" class="btn btn-primary">Сохранить</button>
          </div>
        </form>
      `);
      $('#cpForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/counterparties', {
            name: val('cp_name'),
            kind: val('cp_kind'),
            bin: val('cp_bin'),
            contact: val('cp_contact')
          });
          dictCache = null;
          closeModal();
          toast('Контрагент добавлен', 'ok');
          render();
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  // ---------- Регистрация разделов ----------
  VIEWS.inbound = () => viewOperations('завоз');
  VIEWS.outbound = () => viewOperations('вывоз');
  VIEWS.invoices = viewInvoices;
  VIEWS.dictionaries = viewDictionaries;
// Дата со временем, как в образце: «16.09.2026 16:38:18».
  function stamp(v) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
    if (!m) return s || '—';
    return m[3] + '.' + m[2] + '.' + m[1] + (m[4] ? ' ' + m[4] : '');
  }

  // Формы отдают только дату — время подставляем текущее, чтобы в карточке
  // хранился полный штамп «дата + время», как в образце.
  function withTime(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return s + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // ---------- Реальное время ----------
  const socket = window.__dashboardSocket || (typeof connectSocket === 'function' ? connectSocket() : null);
  if (socket) {
    socket.on('operation:update', () => {
      if (core.currentView === 'inbound' || core.currentView === 'outbound') render();
    });
    socket.on('invoice:update', () => {
      if (core.currentView === 'invoices') render();
    });
    socket.on('dictionary:update', () => {
      dictCache = null;
      if (core.currentView === 'dictionaries') render();
    });
  }
})();
