// QazconHub Terminal — панель управления (часть 2: заявки, очередь, пропуска, журнал, отчёты, инициализация)
(function () {
  'use strict';

  const core = window.__dashboardCore;
  if (!core) return;
  const { NAV, allowedNav, role, user, $, content, sideNav, buildNav, switchView, openModal, closeModal, render, VIEWS } = core;

  // ============================================================
  // ЗАЯВКИ
  // ============================================================
  async function viewRequests() {
    const requests = await API.get('/api/requests');
    const isClient = role === 'client';
    const canManage = ['admin', 'dispatcher', 'shift'].includes(role);

    content.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Заявки (${requests.length})</h3>
          ${isClient ? `<button class="btn btn-primary" id="addRequest">+ Новая заявка</button>` : ''}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Тип</th><th>Контейнер</th><th>Груз</th><th>Вес</th><th>Слот</th><th>Статус</th>${canManage ? '<th></th>' : ''}</tr></thead>
            <tbody id="rBody"></tbody>
          </table>
        </div>
      </div>
    `;

    function draw() {
      $('#rBody').innerHTML = requests.map(r => `
        <tr>
          <td>#${r.id}</td>
          <td>${esc(r.type)}</td>
          <td class="mono">${esc(r.container_number || '—')}</td>
          <td>${esc(r.cargo || '—')}</td>
          <td>${r.weight ? r.weight + ' т' : '—'}</td>
          <td>${esc(r.date_slot || '')} ${esc(r.time_slot || '')}</td>
          <td><span class="badge ${statusClass(r.status)}">${esc(statusLabel(r.status, REQUEST_STATUS))}</span></td>
          ${canManage ? `<td><button class="btn btn-sm" data-redit="${r.id}">✎</button></td>` : ''}
        </tr>
      `).join('') || '<tr><td colspan="8" class="empty">Заявок нет</td></tr>';
    }
    draw();

    if (isClient) {
      $('#addRequest').addEventListener('click', () => {
        openModal(`
          <h3>Новая заявка</h3>
          <form id="rForm">
            <label class="field"><span>Тип</span>
              <select id="r_type"><option value="контейнер">Контейнер</option><option value="вагон">Вагон</option><option value="хранение">Хранение</option><option value="другое">Другое</option></select>
            </label>
            <label class="field"><span>Номер контейнера</span><input id="r_cont" placeholder="TCLU1234567"></label>
            <label class="field"><span>Груз</span><input id="r_cargo"></label>
            <label class="field"><span>Вес (т)</span><input id="r_weight" type="number" step="0.1"></label>
            <div class="form-row">
              <label class="field"><span>Дата</span><input id="r_date" type="date"></label>
              <label class="field"><span>Время</span><input id="r_time" type="time"></label>
            </div>
            <label class="field"><span>Комментарий</span><textarea id="r_comment" rows="2"></textarea></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Отправить</button></div>
          </form>
        `);
        $('#rForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/requests', {
              type: $('#r_type').value, container_number: $('#r_cont').value,
              cargo: $('#r_cargo').value, weight: $('#r_weight').value,
              date_slot: $('#r_date').value, time_slot: $('#r_time').value, comment: $('#r_comment').value
            });
            closeModal(); toast('Заявка отправлена', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    }

    if (canManage) {
      content.querySelectorAll('[data-redit]').forEach(b => b.addEventListener('click', () => {
        const r = requests.find(x => x.id == b.dataset.redit);
        openModal(`
          <h3>Заявка #${r.id}</h3>
          <form id="reForm">
            <label class="field"><span>Статус</span>
              <select id="re_status">${Object.entries(REQUEST_STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </label>
            <div class="form-row">
              <label class="field"><span>Дата</span><input id="re_date" type="date" value="${esc(r.date_slot || '')}"></label>
              <label class="field"><span>Время</span><input id="re_time" type="time" value="${esc(r.time_slot || '')}"></label>
            </div>
            <label class="field"><span>Комментарий</span><textarea id="re_comment" rows="2">${esc(r.comment || '')}</textarea></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Сохранить</button></div>
          </form>
        `);
        $('#reForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.patch('/api/requests/' + r.id, {
              status: $('#re_status').value, date_slot: $('#re_date').value,
              time_slot: $('#re_time').value, comment: $('#re_comment').value
            });
            closeModal(); toast('Сохранено', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      }));
    }
  }

  // ============================================================
  // ЭЛЕКТРОННАЯ ОЧЕРЕДЬ
  // ============================================================
  async function viewQueue() {
    const queue = await API.get('/api/queue');
    const canAdd = ['driver', 'client', 'admin', 'dispatcher'].includes(role);
    const canManage = ['admin', 'dispatcher', 'guard', 'shift'].includes(role);

    content.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Электронная очередь (${queue.length})</h3>
          ${canAdd ? `<button class="btn btn-primary" id="addQueue">+ Встать в очередь</button>` : ''}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Госномер</th><th>Водитель</th><th>Цель</th><th>Слот</th><th>Статус</th>${canManage ? '<th></th>' : ''}</tr></thead>
            <tbody id="qBody"></tbody>
          </table>
        </div>
      </div>
    `;

    function draw() {
      $('#qBody').innerHTML = queue.map((q, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="mono">${esc(q.plate)}</td>
          <td>${esc(q.driver || '—')}</td>
          <td>${esc(q.purpose || '—')}</td>
          <td>${esc(q.slot || '—')}</td>
          <td><span class="badge ${statusClass(q.status)}">${esc(statusLabel(q.status, QUEUE_STATUS))}</span></td>
          ${canManage ? `<td><button class="btn btn-sm" data-qedit="${q.id}">✎</button></td>` : ''}
        </tr>
      `).join('') || '<tr><td colspan="7" class="empty">Очередь пуста</td></tr>';
    }
    draw();

    if (canAdd) {
      $('#addQueue').addEventListener('click', () => {
        openModal(`
          <h3>Встать в очередь</h3>
          <form id="qForm">
            <label class="field"><span>Госномер *</span><input id="q_plate" required placeholder="A123BC"></label>
            <label class="field"><span>Водитель</span><input id="q_driver"></label>
            <label class="field"><span>Цель</span><input id="q_purpose" placeholder="Забор контейнера"></label>
            <label class="field"><span>Желаемый слот</span><input id="q_slot" placeholder="Например: 14:00"></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Записаться</button></div>
          </form>
        `);
        $('#qForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/queue', { plate: $('#q_plate').value, driver: $('#q_driver').value, purpose: $('#q_purpose').value, slot: $('#q_slot').value });
            closeModal(); toast('Вы в очереди', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    }

    if (canManage) {
      content.querySelectorAll('[data-qedit]').forEach(b => b.addEventListener('click', () => {
        const q = queue.find(x => x.id == b.dataset.qedit);
        openModal(`
          <h3>Запись ${esc(q.plate)}</h3>
          <form id="qeForm">
            <label class="field"><span>Статус</span>
              <select id="qe_status">${Object.entries(QUEUE_STATUS).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Слот</span><input id="qe_slot" value="${esc(q.slot || '')}"></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Сохранить</button></div>
          </form>
        `);
        $('#qeForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.patch('/api/queue/' + q.id, { status: $('#qe_status').value, slot: $('#qe_slot').value });
            closeModal(); toast('Сохранено', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      }));
    }
  }

  // ============================================================
  // ПРОПУСКНОЙ РЕЖИМ (OCR / шлагбаумы)
  // ============================================================
  async function viewPasses() {
    const [passes, vehicles] = await Promise.all([API.get('/api/passes'), API.get('/api/vehicles')]);
    const canManage = ['admin', 'guard', 'dispatcher', 'shift'].includes(role);

    content.innerHTML = `
      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h3>OCR распознавание номера</h3></div>
          <div class="ocr-box">
            <label class="field"><span>Госномер с камеры</span><input id="ocrPlate" placeholder="A123BC"></label>
            <button class="btn btn-primary btn-block" id="ocrBtn">🔍 Распознать</button>
            <div id="ocrResult" class="ocr-result" hidden></div>
          </div>
          <div class="panel-head" style="margin-top:16px"><h3>Управление шлагбаумом</h3></div>
          <div class="barrier-controls">
            <button class="btn btn-success" id="barOpen">⬆ Открыть</button>
            <button class="btn btn-danger" id="barClose">⬇ Закрыть</button>
            <div id="barStatus" class="barrier-status">Шлагбаум закрыт</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Пропуска</h3>
            ${canManage ? `<button class="btn btn-primary" id="addPass">+ Пропуск</button>` : ''}
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Код</th><th>Госномер</th><th>Тип</th><th>Статус</th></tr></thead>
              <tbody id="pBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $('#pBody').innerHTML = passes.map(p => `
      <tr>
        <td class="mono">${esc(p.code)}</td>
        <td class="mono">${esc(p.plate)}</td>
        <td>${esc(p.type)}</td>
        <td><span class="badge ${statusClass(p.status)}">${esc(p.status === 'активен' ? 'Активен' : 'Использован')}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty">Пропусков нет</td></tr>';

    // OCR
    $('#ocrBtn').addEventListener('click', async () => {
      const plate = $('#ocrPlate').value.trim();
      if (!plate) return toast('Введите номер', 'err');
      const res = await API.post('/api/ocr/recognize', { plate });
      const box = $('#ocrResult');
      box.hidden = false;
      box.className = 'ocr-result ' + (res.allowed ? 'ok' : 'err');
      box.innerHTML = `
        <div class="ocr-plate">${esc(res.plate)}</div>
        <div class="ocr-reason">${esc(res.reason)}</div>
        <div class="ocr-barrier">Шлагбаум: ${res.barrier === 'open' ? '⬆ ОТКРЫТ' : '⬇ ЗАКРЫТ'}</div>
      `;
    });

    // Шлагбаум
    $('#barOpen').addEventListener('click', async () => {
      await API.post('/api/barrier/open', {});
      $('#barStatus').textContent = 'Шлагбаум ОТКРЫТ';
      $('#barStatus').className = 'barrier-status open';
    });
    $('#barClose').addEventListener('click', async () => {
      await API.post('/api/barrier/close', {});
      $('#barStatus').textContent = 'Шлагбаум закрыт';
      $('#barStatus').className = 'barrier-status';
    });

    if (canManage) {
      $('#addPass').addEventListener('click', () => {
        openModal(`
          <h3>Новый пропуск</h3>
          <form id="pForm">
            <label class="field"><span>Госномер *</span><input id="p_plate" required placeholder="A123BC"></label>
            <label class="field"><span>Тип</span><select id="p_type"><option value="разовый">Разовый</option><option value="постоянный">Постоянный</option></select></label>
            <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div>
          </form>
        `);
        $('#pForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await API.post('/api/passes', { plate: $('#p_plate').value, type: $('#p_type').value });
            closeModal(); toast('Пропуск создан', 'ok'); render();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    }
  }

  // ============================================================
  // ЖУРНАЛ ДЕЙСТВИЙ
  // ============================================================
  async function viewAudit() {
    const logs = await API.get('/api/audit');
    content.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Журнал действий (${logs.length})</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Детали</th></tr></thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${fmtDate(l.created_at)}</td>
                  <td>${esc(l.user_name || '—')}</td>
                  <td><span class="mono">${esc(l.action)}</span></td>
                  <td>${esc(l.details || '—')}</td>
                </tr>
              `).join('') || '<tr><td colspan="4" class="empty">Нет записей</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // ОТЧЁТЫ
  // ============================================================
  async function viewReports() {
    content.innerHTML = `
      <div class="grid-2">
        <div class="panel report-card">
          <div class="report-icon">📦</div>
          <h3>Отчёт по контейнерам</h3>
          <p>Полный список контейнеров на терминале с размещением и статусами.</p>
          <a class="btn btn-primary" href="/api/report/containers" target="_blank">Скачать PDF</a>
        </div>
        <div class="panel report-card">
          <div class="report-icon">🚂</div>
          <h3>Отчёт по вагонам</h3>
          <p>Список вагонов на путях ППЖТ с грузами и владельцами.</p>
          <a class="btn btn-primary" href="/api/report/wagons" target="_blank">Скачать PDF</a>
        </div>
      </div>
    `;
  }

  // Регистрируем оставшиеся модули
  VIEWS.requests = viewRequests;
  VIEWS.queue = viewQueue;
  VIEWS.passes = viewPasses;
  VIEWS.audit = viewAudit;
  VIEWS.reports = viewReports;

  // ---------- Инициализация ----------
  buildNav();
  pageTitle.textContent = NAV[core.currentView].label;
  render();

  // ---------- Socket.IO реального времени ----------
  const socket = connectSocket();
  // Сокет доступен другим модулям панели (документооборот), чтобы не открывать
  // второе соединение на ту же страницу.
  window.__dashboardSocket = socket;
  if (socket) {
    socket.emit('terminal:join', role);
    socket.on('container:update', () => { if (core.currentView === 'containers') render(); });
    socket.on('wagon:update', () => { if (core.currentView === 'tracks') render(); });
    socket.on('equipment:update', () => { if (core.currentView === 'equipment') render(); });
    socket.on('vehicle:update', () => { if (core.currentView === 'vehicles') render(); });
    socket.on('request:update', () => { if (core.currentView === 'requests') render(); });
    socket.on('queue:update', () => { if (core.currentView === 'queue') render(); });
    socket.on('pass:update', () => { if (core.currentView === 'passes') render(); });
    socket.on('barrier:update', (d) => {
      const st = $('#barStatus');
      if (st) {
        st.textContent = d.action === 'open' ? 'Шлагбаум ОТКРЫТ' : 'Шлагбаум закрыт';
        st.className = 'barrier-status' + (d.action === 'open' ? ' open' : '');
      }
    });
  }

  // ---------- Выход ----------
  $('#logoutBtn').addEventListener('click', () => API.logout());

  // ---------- Мобильное меню ----------
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }
  function isMobileMenu() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  $('#menuBtn').addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeMenu();
    else openMenu();
  });
  overlay.addEventListener('click', closeMenu);

  // Закрывать меню после выбора пункта навигации
  sideNav.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') && isMobileMenu()) closeMenu();
  });

  // Закрывать по клавише Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) closeMenu();
  });

  // Свайп влево — закрыть меню, свайп вправо от края — открыть
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!isMobileMenu()) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Горизонтальный свайп значительнее вертикального
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0 && sidebar.classList.contains('open')) closeMenu();
    else if (dx > 0 && !sidebar.classList.contains('open') && touchStartX < 40) openMenu();
  }, { passive: true });

  // При изменении размера окна на десктоп — сбросить состояние меню
  window.addEventListener('resize', () => {
    if (!isMobileMenu() && sidebar.classList.contains('open')) closeMenu();
  });
})();
