let mapAdmin;

async function adminAuth() {
  const login = document.getElementById("aLogin").value;
  const pass = document.getElementById("aPass").value;
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, pass })
  });
  const data = await res.json();
  if (data.ok && data.user.role === "admin") {
    document.getElementById("adminAuth").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    initAdminMap();
    loadAdminData();
    setInterval(loadAdminData, 8000);
  }
}

async function initAdminMap() {
  await ymaps3.ready;
  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = ymaps3;

  mapAdmin = new YMap(document.getElementById('map'), {
    location: { center: [76.95, 43.25], zoom: 12 }
  });

  mapAdmin.addChild(new YMapDefaultSchemeLayer());
  mapAdmin.addChild(new YMapDefaultFeaturesLayer());
}

async function loadAdminData() {
  loadOrdersAdmin();
  loadFinance();
}

async function loadOrdersAdmin() {
  const orders = await (await fetch("/api/orders")).json();
  const couriers = await (await fetch("/api/couriers")).json();
  const cont = document.getElementById("adminOrders");
  cont.innerHTML = "";
  orders.forEach(o => {
    cont.innerHTML += `
      <div class="card">
        #${o.id} | ${o.status}<br>
        ${o.pointA} → ${o.pointB}<br>
        <select id="sel${o.id}">
          <option value="">Курьер</option>
          ${couriers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
        <button onclick="assign(${o.id})">Назначить</button>
        <a href="/api/receipt/${o.id}" target="_blank">PDF</a>
      </div>
    `;
  });
}

async function assign(orderId) {
  const cid = document.getElementById(`sel${orderId}`).value;
  await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courierId: cid, status: "assigned" })
  });
  loadOrdersAdmin();
}

async function loadFinance() {
  const orders = await (await fetch("/api/orders")).json();
  const couriers = await (await fetch("/api/couriers")).json();
  let out = "";
  couriers.forEach(c => {
    const done = orders.filter(x => x.courierId == c.id && x.status === "done").length;
    out += `<p>${c.name}: ${done} заказов</p>`;
  });
  document.getElementById("financeReport").innerHTML = out;
}