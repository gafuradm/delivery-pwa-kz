// QazconHub Terminal — реестр прибытия ЖД транспортом (часть 4).
// Раздел ведёт помесячный журнал подач: номер, прибытие за месяц года и время, код,
// номер вагона, номер контейнера, вид к-ра, вес контейнера, пломба по документу,
// фактическая пломба, собственник, грузополучатель, метка ГПС.
// Пломбы хранятся раздельно и подсвечиваются при расхождении: это рабочая сверка
// приёмосдатчика на месте, а не косметическая деталь.
(function () {
  'use strict';

  const core = window.__dashboardCore;
  if (!core) return;
  const { role, user, content, openModal, closeModal, render, VIEWS } = core;

  // Права повторяют серверные roleRequired, иначе кнопки в интерфейсе будут врать.
  const CAN_RAIL = ['admin', 'dispatcher', 'receiver', 'ppjt', 'shift', 'guard'].includes(role);
  const CAN_RAIL_DELETE = ['admin', 'dispatcher'].includes(role);

  const RAIL_STATUS = { 'ожидается': 'Ожидается', 'прибыл': 'Прибыл', 'оформлен': 'Оформлен' };
  const RAIL_KINDS = ['20', '40', '45', 'Порожний'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // ---------- Кэш справочников ----------
  let dictCache = null;
  async function dictionaries(force) {
    if (!dictCache || force) dictCache = await API.get('/api/dictionaries');
    return dictCache;
  }

  // ---------- Помощники разметки (свой набор, чтобы не зависеть от других модулей) ----------
  function options(list, selectedId, emptyLabel) {
    const head = `<option value="">${esc(emptyLabel || '—')}</option>`;
    return head + (list || []).map((item) => {
      const label = item.name || item.number || ('#' + item.id);
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
    const el = document.getElementById(id);
    if (!el) return '';
    return el.type === 'checkbox' ? el.checked : el.value.trim();
  }

  function num(id) {
    const v = val(id);
    return v ? Number(v) : null;
  }

  // Строка «Прибытие»: месяц года и время в одном читаемом значении.
  function periodText(row) {
    const month = row.arrival_month ? String(row.arrival_month).padStart(2, '0') : '—';
    const year = row.arrival_year || '—';
    return month + '.' + year + (row.arrival_time ? ' ' + row.arrival_time : '');
  }

  function railStatusBadge(status) {
    const cls = status === 'оформлен' ? 'st-ok' : (status === 'прибыл' ? 'st-assigned' : 'st-new');
    return `<span class="badge ${cls}">${esc(RAIL_STATUS[status] || status || '—')}</span>`;
  }

  // Фактическая пломба: при расхождении с документом показываем явный признак.
  function sealFactCell(row) {
    if (!row.seal_fact) {
      return row.seal_doc
        ? '<span class="badge st-cancelled">не сверена</span>'
        : '<span class="muted">—</span>';
    }
    const badge = row.seal_mismatch ? ' <span class="badge st-cancelled">≠ расхождение</span>' : '';
    return `<span class="mono">${esc(row.seal_fact)}</span>${badge}`;
  }

  // ---------- Скачивание PDF ----------
  // Отчёты отдаются только с токеном, поэтому обычная ссылка <a href> получила бы 401:
  // забираем файл через fetch с заголовком и сохраняем полученный blob.
  async function downloadReport(year, month) {
    try {
      const res = await fetch(`/api/report/rail-arrivals?year=${year}&month=${month}`, {
        headers: { Authorization: 'Bearer ' + API.getToken() }
      });
      if (!res.ok) throw new Error('Не удалось сформировать отчёт');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rail-arrivals-${String(month).padStart(2, '0')}-${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ============================================================
  // РЕЕСТР ПРИБЫТИЯ ЖД
  // ============================================================
  async function viewRail() {
    const now = new Date();
    const state = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      kind: '',
      status: '',
      q: '',
      mismatch: false
    };

    function params() {
      const p = ['year=' + state.year, 'month=' + state.month];
      if (state.kind) p.push('kind=' + encodeURIComponent(state.kind));
      if (state.status) p.push('status=' + encodeURIComponent(state.status));
      if (state.q) p.push('q=' + encodeURIComponent(state.q));
      if (state.mismatch) p.push('mismatch=1');
      return p.join('&');
    }

    async function paint() {
      const dict = await dictionaries();
      const data = await API.get('/api/rail-arrivals?' + params());
      const items = data.items || [];
      const summary = data.summary || {};
      const years = [];
      for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) years.push(y);

      const rows = items.map((r) => `
        <tr>
          <td class="mono">${esc(r.doc_no)}</td>
          <td>${esc(periodText(r))}</td>
          <td class="mono">${esc(r.code || '—')}</td>
          <td class="mono">${esc(r.wagon_number || '—')}</td>
          <td class="mono">${esc(r.container_number || '—')}</td>
          <td>${esc(r.container_kind || '—')}</td>
          <td>${r.container_weight ? esc(String(r.container_weight)) + ' т' : '—'}</td>
          <td class="mono">${esc(r.seal_doc || '—')}</td>
          <td>${sealFactCell(r)}</td>
          <td>${esc(r.owner_name || '—')}</td>
          <td>${esc(r.recipient_name || '—')}</td>
          <td>${r.has_gps
            ? `<span class="badge st-info">${esc(r.gps_mark || 'с меткой')}</span>`
            : '<span class="muted">без метки</span>'}</td>
          <td>${railStatusBadge(r.status)}</td>
          <td>
            <div class="panel-actions">
              ${CAN_RAIL ? `<button class="btn btn-sm" data-edit="${r.id}">Открыть</button>` : ''}
              ${CAN_RAIL_DELETE ? `<button class="btn btn-sm btn-danger" data-del="${r.id}" data-label="${esc(r.doc_no)}">Удалить</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="14" class="empty">Записей за выбранный период нет</td></tr>`;

      content.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <h3>Прибытие ЖД транспортом — ${esc(MONTHS[state.month - 1])} ${state.year} (${items.length})</h3>
            <div class="panel-actions">
              <select class="input" id="railMonth" style="width:auto">
                ${MONTHS.map((m, i) => `<option value="${i + 1}"${state.month === i + 1 ? ' selected' : ''}>${esc(m)}</option>`).join('')}
              </select>
              <select class="input" id="railYear" style="width:auto">
                ${years.map((y) => `<option value="${y}"${state.year === y ? ' selected' : ''}>${y}</option>`).join('')}
              </select>
              <select class="input" id="railKind" style="width:auto">
                <option value="">Все виды к-ра</option>
                ${RAIL_KINDS.map((k) => `<option value="${esc(k)}"${state.kind === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}
              </select>
              <select class="input" id="railStatusFilter" style="width:auto">
                <option value="">Все статусы</option>
                ${Object.keys(RAIL_STATUS).map((s) => `<option value="${s}"${state.status === s ? ' selected' : ''}>${esc(RAIL_STATUS[s])}</option>`).join('')}
              </select>
              <input class="input" id="railSearch" placeholder="Поиск: № документа, контейнер, вагон, пломба, ГПС" value="${esc(state.q)}" style="width:260px">
              <button class="btn" id="railMismatch">${state.mismatch ? '✓ ' : ''}Только расхождения пломб</button>
              <button class="btn" id="railPdf">📄 PDF за месяц</button>
              ${CAN_RAIL ? '<button class="btn btn-primary" id="railAdd">+ Прибытие</button>' : ''}
            </div>
          </div>
          <div class="panel-body" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <span class="chip">Записей: <strong>${summary.total || 0}</strong></span>
            <span class="chip">Вес: <strong>${(summary.weight || 0).toFixed(2)} т</strong></span>
            <span class="chip">Расхождения пломб: <strong>${summary.mismatch || 0}</strong></span>
            <span class="chip">С меткой ГПС: <strong>${summary.withGps || 0}</strong></span>
            ${RAIL_KINDS.map((k) => `<span class="chip">${esc(k)}: <strong>${(summary.byKind || {})[k] || 0}</strong></span>`).join('')}
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr>
                <th>Номер</th><th>Прибытие (месяц года / время)</th><th>Код</th><th>Номер вагона</th>
                <th>Номер контейнера</th><th>Вид к-ра</th><th>Вес к-ра</th><th>Пломба по документу</th>
                <th>Фактическая пломба</th><th>Собственник</th><th>Грузополучатель</th><th>Метка ГПС</th>
                <th>Статус</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('railMonth').addEventListener('change', (e) => { state.month = Number(e.target.value); paint().catch(err); });
      document.getElementById('railYear').addEventListener('change', (e) => { state.year = Number(e.target.value); paint().catch(err); });
      document.getElementById('railKind').addEventListener('change', (e) => { state.kind = e.target.value; paint().catch(err); });
      document.getElementById('railStatusFilter').addEventListener('change', (e) => { state.status = e.target.value; paint().catch(err); });
      document.getElementById('railSearch').addEventListener('change', (e) => { state.q = e.target.value.trim(); paint().catch(err); });
      document.getElementById('railMismatch').addEventListener('click', () => { state.mismatch = !state.mismatch; paint().catch(err); });
      document.getElementById('railPdf').addEventListener('click', () => downloadReport(state.year, state.month));
      if (document.getElementById('railAdd')) {
        document.getElementById('railAdd').addEventListener('click', () => openRailForm(null, { year: state.year, month: state.month }));
      }
      content.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openRailForm(b.dataset.edit)));
      content.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeRail(b.dataset.del, b.dataset.label)));
    }

    function err(e) { toast(e.message, 'err'); }
    await paint();
  }

  // ---------- Удаление записи ----------
  async function removeRail(id, label) {
    if (!confirm('Удалить запись прибытия ' + (label || '#' + id) + '? Действие нельзя отменить.')) return;
    try {
      await API.del('/api/rail-arrivals/' + id);
      toast('Запись прибытия удалена', 'ok');
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ============================================================
  // ФОРМА ПРИБЫТИЯ (создание и редактирование)
  // ============================================================
  async function openRailForm(id, defaults) {
    const dict = await dictionaries();
    const now = new Date();
    const isEdit = !!id;
    const row = isEdit ? await API.get('/api/rail-arrivals/' + id) : {};
    const base = Object.assign({}, defaults || {}, row);

    const year = base.arrival_year || now.getFullYear();
    const month = base.arrival_month || (now.getMonth() + 1);
    const time = base.arrival_time || now.toTimeString().slice(0, 5);

    openModal(`
      <h3>${isEdit ? 'Прибытие ЖД ' + esc(row.doc_no) : 'Новое прибытие ЖД транспортом'}</h3>
      <form id="railForm">
        <div class="form-row">
          ${field('Прибытие — месяц года', `<select id="r_month">${MONTHS.map((m, i) =>
            `<option value="${i + 1}"${month === i + 1 ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>`)}
          ${field('Год', `<input id="r_year" type="number" min="2000" max="2100" value="${esc(year)}">`)}
        </div>
        <div class="form-row">
          ${field('Время прибытия', `<input id="r_time" type="time" value="${esc(time)}">`)}
          ${field('Код', `<input id="r_code" placeholder="KZT-ALM" value="${esc(base.code || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Номер вагона', `<input id="r_wagon" placeholder="54512345" value="${esc(base.wagon_number || '')}">`)}
          ${field('Номер контейнера *', `<input id="r_container" placeholder="TCLU1234567" value="${esc(base.container_number || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Вид к-ра', `<select id="r_kind">${valueOptions(RAIL_KINDS, base.container_kind || '20')}</select>`)}
          ${field('Вес контейнера, т', `<input id="r_weight" type="number" step="0.01" min="0" value="${esc(base.container_weight || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Номер пломбы по документу', `<input id="r_seal_doc" value="${esc(base.seal_doc || '')}">`)}
          ${field('Фактический номер пломбы', `<input id="r_seal_fact" value="${esc(base.seal_fact || '')}">`)}
        </div>
        <div class="form-row">
          <div class="muted" id="r_seal_hint" style="width:100%"></div>
        </div>
        <div class="form-row">
          ${field('Собственник', `<select id="r_owner">${options(dict.counterparties, base.owner_id, '— не указан —')}</select>`)}
          ${field('Грузополучатель', `<select id="r_recipient">${options(dict.counterparties, base.recipient_id, '— не указан —')}</select>`)}
        </div>
        <div class="form-row">
          ${field('Метка ГПС', `<div><label><input id="r_has_gps" type="checkbox"${base.has_gps ? ' checked' : ''}> с меткой ГПС</label></div>`)}
          ${field('Номер метки ГПС', `<input id="r_gps" placeholder="GPS-77" value="${esc(base.gps_mark || '')}">`)}
        </div>
        <div class="form-row">
          ${field('Статус', `<select id="r_status">${valueOptions(Object.keys(RAIL_STATUS), base.status || 'ожидается')}</select>`)}
          ${field('Ответственный', `<select id="r_responsible">${options(dict.responsible, base.responsible_id || user.id, '— не указано —')}</select>`)}
        </div>
        ${field('Комментарий', `<input id="r_comment" value="${esc(base.comment || '')}">`)}
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Записать' : 'Создать'}</button>
          <button type="button" class="btn" data-close>Закрыть</button>
        </div>
      </form>
    `, 'modal modal-wide');

    // Живая сверка пломб: пользователь видит расхождение ещё до сохранения.
    function sealHint() {
      const hint = document.getElementById('r_seal_hint');
      if (!hint) return;
      const doc = String(val('r_seal_doc')).trim().toUpperCase();
      const fact = String(val('r_seal_fact')).trim().toUpperCase();
      if (!doc) { hint.innerHTML = '<span class="muted">Пломба по документу не указана — сверка не требуется.</span>'; return; }
      if (!fact) { hint.innerHTML = '<span class="badge st-cancelled">Фактическая пломба не указана</span>'; return; }
      hint.innerHTML = doc === fact
        ? '<span class="badge st-ok">Пломбы совпадают</span>'
        : '<span class="badge st-cancelled">Расхождение пломб: документ ≠ факт</span>';
    }
    ['r_seal_doc', 'r_seal_fact'].forEach((f) => {
      const el = document.getElementById(f);
      if (el) el.addEventListener('input', sealHint);
    });
    sealHint();

    document.getElementById('railForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        arrival_year: Number(val('r_year')) || now.getFullYear(),
        arrival_month: Number(val('r_month')) || (now.getMonth() + 1),
        arrival_time: val('r_time'),
        code: val('r_code'),
        wagon_number: val('r_wagon'),
        container_number: val('r_container'),
        container_kind: val('r_kind'),
        container_weight: Number(val('r_weight')) || 0,
        seal_doc: val('r_seal_doc'),
        seal_fact: val('r_seal_fact'),
        owner_id: num('r_owner'),
        recipient_id: num('r_recipient'),
        has_gps: val('r_has_gps'),
        gps_mark: val('r_gps'),
        status: val('r_status'),
        responsible_id: num('r_responsible'),
        comment: val('r_comment')
      };
      if (!payload.container_number) return toast('Укажите номер контейнера', 'err');
      if (payload.has_gps && !payload.gps_mark) return toast('Укажите номер метки ГПС или снимите признак', 'err');
      try {
        if (isEdit) {
          await API.patch('/api/rail-arrivals/' + id, payload);
          toast('Запись ' + row.doc_no + ' записана', 'ok');
        } else {
          const created = await API.post('/api/rail-arrivals', payload);
          toast('Прибытие ' + created.doc_no + ' внесено', 'ok');
        }
        closeModal();
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

  // ---------- Регистрация раздела и реального времени ----------
  VIEWS.rail = viewRail;

  const socket = window.__dashboardSocket;
  if (socket) {
    socket.on('rail:update', () => { if (core.currentView === 'rail') render(); });
  }
})();
