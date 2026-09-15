// QazconHub Terminal — роль-ориентированная панель управления (часть 1: ядро и основные модули)
(function () {
  'use strict';

  const user = API.getUser();
  if (!user || !API.getToken()) {
    window.location.href = '/';
    return;
  }

  const role = user.role;

  // ---------- Навигация по ролям ----------
  const NAV = {
    overview: { label: 'Обзор', icon: '📊', roles: ['admin', 'director', 'dispatcher', 'ppjt', 'receiver', 'crane', 'store', 'guard', 'customs', 'finance', 'shift'] },
    containers: { label: 'Контейнеры', icon: '📦', roles: ['admin', 'dispatcher', 'receiver', 'crane', 'store', 'shift', 'customs'] },
    tracks: { label: 'Пути и вагоны', icon: '🚂', roles: ['admin', 'ppjt', 'receiver', 'shift'] },
    equipment: { label: 'Спецтехника', icon: '🏗️', roles: ['admin', 'dispatcher', 'crane', 'shift'] },
    vehicles: { label: 'Транспорт', icon: '🚛', roles: ['admin', 'guard', 'dispatcher', 'shift'] },
    requests: { label: 'Заявки', icon: '📋', roles: ['admin', 'dispatcher', 'shift', 'client', 'customs', 'finance'] },
    queue: { label: 'Электронная очередь', icon: '🔢', roles: ['admin', 'dispatcher', 'guard', 'driver', 'client', 'shift'] },
    passes: { label: 'Пропускной режим', icon: '🛂', roles: ['admin', 'guard', 'dispatcher', 'shift'] },
    audit: { label: 'Журнал действий', icon: '📜', roles: ['admin', 'director', 'shift'] },
    reports: { label: 'Отчёты', icon: '📄', roles: ['admin', 'director', 'finance', 'shift'] }
  };

  const allowedNav = Object.entries(NAV)
    .filter(([, v]) => v.roles.includes(role))
    .map(([k]) => k);

  let currentView = allowedNav.includes('overview') ? 'overview' : allowedNav[0];

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const content = $('#content');
  const sideNav = $('#sideNav');
  const pageTitle = $('#pageTitle');

  $('#userName').textContent = user.name;
  $('#userRole').textContent = ROLE_LABELS[role] || role;
  $('#userAvatar').textContent = (user.name || '?').trim().charAt(0).toUpperCase();

  // ---------- Часы ----------
  function tick() {
    $('#clock').textContent = new Date().toLocaleTimeString('ru-RU');
  }
  tick();
  setInterval(tick, 1000);

  // ---------- Навигация ----------
  function buildNav() {
    sideNav.innerHTML = allowedNav.map(k => `
      <button class="nav-item ${k === currentView ? 'active' : ''}" data-view="${k}">
        <span class="nav-icon">${NAV[k].icon}</span>
        <span>${NAV[k].label}</span>
      </button>
    `).join('');
    sideNav.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  }

  function switchView(view) {
    currentView = view;
    pageTitle.textContent = NAV[view].label;
    buildNav();
    render();
  }

  // ---------- Модальное окно ----------
  function openModal(html) {
    $('#modalBox').innerHTML = html;
    $('#modalOverlay').hidden = false;
    $('#modalOverlay').querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
  }
  function closeModal() {
    $('#modalOverlay').hidden = true;
  }
  $('#modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  // ---------- Рендер ----------
  async function render() {
    content.innerHTML = '<div class="loading">Загрузка…</div>';
    try {
      const views = window.__dashboardCore ? window.__dashboardCore.VIEWS : {};
      const fn = views[currentView];
      if (fn) await fn();
    } catch (e) {
      content.innerHTML = `<div class="error-box">${esc(e.message)}</div>`;
    }
  }

  // ============================================================
  // ОБЗОР (статистика)
  // ============================================================
  async function viewOverview() {
    const s = await API.get('/api/stats');
    const cards = [
      { label: 'Контейнеры на терминале', value: s.containersFull, sub: `Всего: ${s.containers}`, icon: '📦', cls: 'blue' },
      { label: 'Вагоны на путях', value: s.wagonsOnTrack, sub: `Всего: ${s.wagons}`, icon: '🚂', cls: 'green' },
      { label: 'Спецтехника свободна', value: s.eqFree, sub: `Всего: ${s.equipment}`, icon: '🏗️', cls: 'orange' },
      { label: 'Транспорт на территории', value: s.vehicles, sub: 'Активные', icon: '🚛', cls: 'purple' },
      { label: 'В очереди', value: s.queue, sub: 'Ожидают', icon: '🔢', cls: 'red' },
      { label: 'Новые заявки', value: s.requestsNew, sub: 'Требуют внимания', icon: '📋', cls: 'teal' }
    ];
    content.innerHTML = `
      <div class="stats-grid">
        ${cards.map(c => `
          <div class="stat-card ${c.cls}">
            <div class="stat-icon">${c.icon}</div>
            <div class="stat-value">${c.value}</div>
            <div class="stat-label">${c.label}</div>
            <div class="stat-sub">${c.sub}</div>
          </div>
        `).join('')}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Быстрые действия</h3></div>
        <div class="quick-actions">
          ${allowedNav.includes('containers') ? `<button class="btn btn-primary" data-go="containers">📦 Контейнеры</button>` : ''}
          ${allowedNav.includes('tracks') ? `<button class="btn btn-primary" data-go="tracks">🚂 Пути и вагоны</button>` : ''}
          ${allowedNav.includes('queue') ? `<button class="btn btn-primary" data-go="queue">🔢 Очередь</button>` : ''}
          ${allowedNav.includes('passes') ? `<button class="btn btn-primary" data-go="passes">🛂 Пропускной режим</button>` : ''}
          ${allowedNav.includes('requests') ? `<button class="btn btn-primary" data-go="requests">📋 Заявки</button>` : ''}
        </div>
      </div>
    `;
    content.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.go)));
  }

  // ============================================================
  // КОНТЕЙНЕРЫ
  // ============================================================
  async function viewContainers() {
    const containers = await API.get('/api/containers');
    const canEdit = ['admin', 'dispatcher', 'receiver', 'crane', 'shift'].includes(role);
    const canCreate = ['admin', 'dispatcher', 'receiver', 'guard', 'shift'].includes(role);

    content.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>Контейнеры (${containers.length})</h3>
          <div class="panel-actions">
            <input type="text" id="cSearch" class="input" placeholder="Поиск по номеру/клиенту…" style="width:220px">
            ${canCreate ? `<button class="btn btn-primary" id="addContainer">+ Контейнер</button>` : ''}
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Номер</th><th>Размер</th><th>Тип</th><th>Статус</th>
              <th>Размещение</th><th>Клиент</th><th>Груз</th><th>Вес</th>
              ${canEdit ? '<th></th>' : ''}
            </tr></thead>
            <tbody id="cBody"></tbody>
          </table>
        </div>
      </div>
    `;

    function draw(list) {
      $('#cBody').innerHTML = list.map(c => `
        <tr>
          <td class="mono">${esc(c.number)}</td>
          <td>${esc(c.size)}фт</td>
          <td>${esc(c.type)}</td>
          <td><span class="badge ${statusClass(c.status)}">${esc(statusLabel(c.status, CONTAINER_STATUS))}</span></td>
          <td class="mono">${esc(c.zone || '—')}/${esc(c.row || '—')}/${esc(c.stack || '—')}/${esc(c.tier || '—')}</td>
          <td>${esc(c.client || '—')}</td>
          <td>${esc(c.cargo || '—')}</td>
          <td>${c.weight ? c.weight + ' т' : '—'}</td>
          ${canEdit ? `<td><button class="btn btn-sm" data-edit="${c.id}">✎</button></td>` : ''}
        </tr>
      `).join('') || '<tr><td colspan="9" class="empty">Контейнеров нет</td></tr>';
    }
    draw(containers);

    $('#cSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      draw(containers.filter(c => (c.number + ' ' + c.client + ' ' + c.cargo).toLowerCase().includes(q)));
    });

    if (canCreate) {
      $('#addContainer').addEventListener('click', () => {
        openModal(`
          <h3>Новый контейнер</h3>
          <form id="cForm">
            <label class="field"><span>Номер контейнера *</span><input id="f_number" required placeholder="TCLU1234567"></label>
            <div class="form-row">
              <label class="field"><span>Размер</span><select id="f_size"><option>20</option><option>40</option><option>45</option></select></label>
              <label class="field"><span>Тип</span><select id="f_type"><option>Гружёный</option><option>Порожний</option><option>Рефрижератор</option></select></label>
            </div>
            <label class="field"><span>Клиент</span><input id="f_client"></label>
            <label class="field"><span>Груз</span><input id="f_cargo"></label>
            <label class="field"><span>Вес (т)</span><input id="f_weight" type="number" step="0.1"></label>
            <div class="modal-actions">
              <button type="button" class="btn" data-close>Отмена</button>
              <button type="submit" class="btn btn-primary">Создать</button>
            </div>
          </form>
        `);
        $('#cForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/containers', {
              number: $('#f_number').value,
              size: $('#f_size').value,
              type: $('#f_type').value,
              client: $('#f_client').value,
              cargo: $('#f_cargo').value,
              weight: $('#f_weight').value
            });
            closeModal();
            toast('Контейнер создан', 'ok');
            render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    }

    if (canEdit) {
      content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
        const c = containers.find(x => x.id == b.dataset.edit);
        openModal(`
          <h3>Контейнер ${esc(c.number)}</h3>
          <form id="eForm">
            <label class="field"><span>Статус</span>
              <select id="e_status">${Object.entries(CONTAINER_STATUS).map(([k, v]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </label>
            <div class="form-row">
              <label class="field"><span>Зона</span><input id="e_zone" value="${esc(c.zone)}"></label>
              <label class="field"><span>Ряд</span><input id="e_row" value="${esc(c.row)}"></label>
            </div>
            <div class="form-row">
              <label class="field"><span>Ярус</span><input id="e_stack" value="${esc(c.stack)}"></label>
              <label class="field"><span>Уровень</span><input id="e_tier" value="${esc(c.tier)}"></label>
            </div>
            <label class="field"><span>Клиент</span><input id="e_client" value="${esc(c.client)}"></label>
            <label class="field"><span>Груз</span><input id="e_cargo" value="${esc(c.cargo)}"></label>
            <div class="modal-actions">
              <button type="button" class="btn" data-close>Отмена</button>
              <button type="submit" class="btn btn-primary">Сохранить</button>
            </div>
          </form>
        `);
        $('#eForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.patch('/api/containers/' + c.id, {
              status: $('#e_status').value,
              zone: $('#e_zone').value,
              row: $('#e_row').value,
              stack: $('#e_stack').value,
              tier: $('#e_tier').value,
              client: $('#e_client').value,
              cargo: $('#e_cargo').value
            });
            closeModal();
            toast('Сохранено', 'ok');
            render();
          } catch (err) { toast(err.message, 'err'); }
        });
      }));
    }
  }

  // ============================================================
  // ПУТИ И ВАГОНЫ (ППЖТ)
  // ============================================================
  async function viewTracks() {
    const [tracks, wagons] = await Promise.all([API.get('/api/tracks'), API.get('/api/wagons')]);
    const canEdit = ['admin', 'ppjt', 'receiver', 'shift'].includes(role);

    content.innerHTML = `
      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h3>Железнодорожные пути</h3>
            ${['admin', 'ppjt'].includes(role) ? `<button class="btn btn-primary" id="addTrack">+ Путь</button>` : ''}
          </div>
          <div class="track-list" id="trackList"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Вагоны (${wagons.length})</h3>
            ${canEdit ? `<button class="btn btn-primary" id="addWagon">+ Вагон</button>` : ''}
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Номер</th><th>Груз</th><th>Путь</th><th>Статус</th>${canEdit ? '<th></th>' : ''}</tr></thead>
              <tbody id="wBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $('#trackList').innerHTML = tracks.map(t => `
      <div class="track-item">
        <div class="track-head">
          <strong>Путь ${esc(t.name)}</strong>
          <span class="badge ${t.occupied >= t.capacity ? 'st-cancelled' : 'st-ok'}">${t.occupied}/${t.capacity}</span>
        </div>
        <div class="track-bar"><div class="track-fill" style="width:${Math.min(100, (t.occupied / t.capacity) * 100)}%"></div></div>
        <div class="track-wagons">
          ${t.wagons.length ? t.wagons.map(w => `<span class="chip">${esc(w.number)}</span>`).join('') : '<span class="muted">Пусто</span>'}
        </div>
      </div>
    `).join('');

    function drawWagons(list) {
      $('#wBody').innerHTML = list.map(w => `
        <tr>
          <td class="mono">${esc(w.number)}</td>
          <td>${esc(w.cargo || '—')}</td>
          <td>${esc(w.track_name || '—')}</td>
          <td><span class="badge ${statusClass(w.status)}">${esc(statusLabel(w.status, WAGON_STATUS))}</span></td>
          ${canEdit ? `<td><button class="btn btn-sm" data-wedit="${w.id}">✎</button></td>` : ''}
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty">Вагонов нет</td></tr>';
    }
    drawWagons(wagons);

    if (['admin', 'ppjt'].includes(role)) {
      $('#addTrack').addEventListener('click', () => {
        openModal(`
          <h3>Новый путь</h3>
          <form id="tForm">
            <label class="field"><span>Название</span><input id="t_name" required placeholder="Путь 1"></label>
            <label class="field"><span>Вместимость (вагонов)</span><input id="t_cap" type="number" value="20"></label>
            <label class="field"><span>Зона</span><input id="t_zone"></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div>
          </form>
        `);
        $('#tForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/tracks', { name: $('#t_name').value, capacity: $('#t_cap').value, zone: $('#t_zone').value });
            closeModal(); toast('Путь создан', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    }

    if (canEdit) {
      $('#addWagon').addEventListener('click', () => {
        openModal(`
          <h3>Новый вагон</h3>
          <form id="wForm">
            <label class="field"><span>Номер вагона *</span><input id="w_number" required></label>
            <label class="field"><span>Груз</span><input id="w_cargo"></label>
            <label class="field"><span>Владелец</span><input id="w_owner"></label>
            <label class="field"><span>Путь</span>
              <select id="w_track">${tracks.map(t => `<option value="${t.id}">Путь ${esc(t.name)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Операция</span>
              <select id="w_op"><option value="прибытие">Прибытие</option><option value="выгрузка">Выгрузка</option><option value="погрузка">Погрузка</option><option value="отправка">Отправка</option></select>
            </label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div>
          </form>
        `);
        $('#wForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/wagons', {
              number: $('#w_number').value, cargo: $('#w_cargo').value,
              owner: $('#w_owner').value, track_id: $('#w_track').value, operation: $('#w_op').value
            });
            closeModal(); toast('Вагон добавлен', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });

      content.querySelectorAll('[data-wedit]').forEach(b => b.addEventListener('click', () => {
        const w = wagons.find(x => x.id == b.dataset.wedit);
        openModal(`
          <h3>Вагон ${esc(w.number)}</h3>
          <form id="weForm">
            <label class="field"><span>Статус</span>
              <select id="we_status">${Object.entries(WAGON_STATUS).map(([k, v]) => `<option value="${k}" ${w.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Путь</span>
              <select id="we_track"><option value="">—</option>${tracks.map(t => `<option value="${t.id}" ${w.track_id == t.id ? 'selected' : ''}>Путь ${esc(t.name)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Направление</span><input id="we_dir" value="${esc(w.direction || '')}"></label>
            <label class="field"><span>Станция назначения</span><input id="we_dest" value="${esc(w.dest_station || '')}"></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Сохранить</button></div>
          </form>
        `);
        $('#weForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.patch('/api/wagons/' + w.id, {
              status: $('#we_status').value, track_id: $('#we_track').value || null,
              direction: $('#we_dir').value, dest_station: $('#we_dest').value
            });
            closeModal(); toast('Сохранено', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      }));
    }
  }

  // ============================================================
  // СПЕЦТЕХНИКА
  // ============================================================
  async function viewEquipment() {
    const eq = await API.get('/api/equipment');
    const canEdit = ['admin', 'dispatcher', 'crane', 'shift'].includes(role);
    const canCreate = ['admin', 'dispatcher', 'shift'].includes(role);

    content.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Спецтехника (${eq.length})</h3>
          ${canCreate ? `<button class="btn btn-primary" id="addEq">+ Техника</button>` : ''}
        </div>
        <div class="eq-grid" id="eqGrid"></div>
      </div>
    `;

    function draw() {
      $('#eqGrid').innerHTML = eq.map(e => `
        <div class="eq-card">
          <div class="eq-top">
            <span class="eq-icon">${e.type === 'Кран' ? '🏗️' : e.type === 'Погрузчик' ? '🚜' : '🔧'}</span>
            <span class="badge ${statusClass(e.status)}">${esc(statusLabel(e.status, EQUIPMENT_STATUS))}</span>
          </div>
          <div class="eq-name">${esc(e.name)}</div>
          <div class="eq-meta">${esc(e.type)} · ${esc(e.plate || '—')}</div>
          <div class="eq-meta">Водитель: ${esc(e.driver || '—')}</div>
          <div class="eq-meta">Топливо: ${e.fuel != null ? e.fuel + '%' : '—'} · Моточасы: ${e.hours || '—'}</div>
          ${canEdit ? `<button class="btn btn-sm btn-block" data-eqedit="${e.id}">Изменить статус</button>` : ''}
        </div>
      `).join('') || '<div class="empty">Техники нет</div>';
    }
    draw();

    if (canCreate) {
      $('#addEq').addEventListener('click', () => {
        openModal(`
          <h3>Новая техника</h3>
          <form id="eqForm">
            <label class="field"><span>Название *</span><input id="eq_name" required></label>
            <label class="field"><span>Тип</span><select id="eq_type"><option>Кран</option><option>Погрузчик</option><option>Тягач</option><option>Другое</option></select></label>
            <label class="field"><span>Госномер</span><input id="eq_plate"></label>
            <label class="field"><span>Водитель</span><input id="eq_driver"></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div>
          </form>
        `);
        $('#eqForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/equipment', { name: $('#eq_name').value, type: $('#eq_type').value, plate: $('#eq_plate').value, driver: $('#eq_driver').value });
            closeModal(); toast('Техника добавлена', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    }

    if (canEdit) {
      content.querySelectorAll('[data-eqedit]').forEach(b => b.addEventListener('click', () => {
        const e = eq.find(x => x.id == b.dataset.eqedit);
        openModal(`
          <h3>${esc(e.name)}</h3>
          <form id="eeForm">
            <label class="field"><span>Статус</span>
              <select id="ee_status">${Object.entries(EQUIPMENT_STATUS).map(([k, v]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Водитель</span><input id="ee_driver" value="${esc(e.driver || '')}"></label>
            <div class="form-row">
              <label class="field"><span>Топливо %</span><input id="ee_fuel" type="number" value="${e.fuel || 0}"></label>
              <label class="field"><span>Моточасы</span><input id="ee_hours" type="number" value="${e.hours || 0}"></label>
            </div>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Сохранить</button></div>
          </form>
        `);
        $('#eeForm').addEventListener('submit', async (e2) => {
          e2.preventDefault();
          try {
            await API.patch('/api/equipment/' + e.id, { status: $('#ee_status').value, driver: $('#ee_driver').value, fuel: $('#ee_fuel').value, hours: $('#ee_hours').value });
            closeModal(); toast('Сохранено', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      }));
    }
  }

  // ============================================================
  // ТРАНСПОРТ (въезд/выезд)
  // ============================================================
  async function viewVehicles() {
    const [vehicles, containers] = await Promise.all([API.get('/api/vehicles'), API.get('/api/containers')]);
    const canManage = ['admin', 'guard', 'dispatcher', 'shift'].includes(role);

    content.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Транспорт на территории</h3>
          ${canManage ? `<button class="btn btn-primary" id="addVehicle">+ Въезд</button>` : ''}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Госномер</th><th>Тип</th><th>Водитель</th><th>Цель</th><th>Контейнер</th><th>Въезд</th><th>Статус</th>${canManage ? '<th></th>' : ''}</tr></thead>
            <tbody id="vBody"></tbody>
          </table>
        </div>
      </div>
    `;

    function draw() {
      $('#vBody').innerHTML = vehicles.map(v => `
        <tr>
          <td class="mono">${esc(v.plate)}</td>
          <td>${esc(v.type)}</td>
          <td>${esc(v.driver || '—')}</td>
          <td>${esc(v.purpose || '—')}</td>
          <td>${v.container_id ? esc((containers.find(c => c.id == v.container_id) || {}).number || '—') : '—'}</td>
          <td>${fmtDate(v.time_in)}</td>
          <td><span class="badge ${statusClass(v.status)}">${esc(statusLabel(v.status, VEHICLE_STATUS))}</span></td>
          ${canManage && v.status !== 'выехал' ? `<td><button class="btn btn-sm" data-vexit="${v.id}">Выезд</button></td>` : ''}
        </tr>
      `).join('') || '<tr><td colspan="8" class="empty">Нет транспорта</td></tr>';
    }
    draw();

    if (canManage) {
      $('#addVehicle').addEventListener('click', () => {
        openModal(`
          <h3>Регистрация въезда</h3>
          <form id="vForm">
            <label class="field"><span>Госномер *</span><input id="v_plate" required placeholder="A123BC"></label>
            <label class="field"><span>Тип</span><select id="v_type"><option>Грузовой</option><option>Легковой</option><option>Тягач</option><option>Рефрижератор</option></select></label>
            <label class="field"><span>Водитель</span><input id="v_driver"></label>
            <label class="field"><span>Цель</span><input id="v_purpose" placeholder="Забор контейнера"></label>
            <label class="field"><span>Контейнер</span>
              <select id="v_container"><option value="">—</option>${containers.map(c => `<option value="${c.id}">${esc(c.number)}</option>`).join('')}</select>
            </label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Зарегистрировать</button></div>
          </form>
        `);
        $('#vForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/vehicles', { plate: $('#v_plate').value, type: $('#v_type').value, driver: $('#v_driver').value, purpose: $('#v_purpose').value, container_id: $('#v_container').value });
            closeModal(); toast('Въезд зарегистрирован', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });

      content.querySelectorAll('[data-vexit]').forEach(b => b.addEventListener('click', async () => {
        try {
          await API.patch('/api/vehicles/' + b.dataset.vexit + '/exit', {});
          toast('Выезд оформлен', 'ok'); render();
        } catch (err) { toast(err.message, 'err'); }
      }));
    }
  }

  // Регистрируем модули, доступные в этой части
  window.__dashboardCore = {
    NAV, allowedNav, role, user,
    get currentView() { return currentView; },
    set currentView(v) { currentView = v; },
    $, content, sideNav, pageTitle,
    buildNav, switchView, openModal, closeModal, render,
    VIEWS: { overview: viewOverview, containers: viewContainers, tracks: viewTracks, equipment: viewEquipment, vehicles: viewVehicles }
  };
})();
