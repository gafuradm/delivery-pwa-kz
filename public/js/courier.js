let courierUser;
let activeOrder;
let signCtx;

async function courierAuth() {
  const login = document.getElementById("cLogin").value;
  const pass = document.getElementById("cPass").value;
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, pass })
  });
  const data = await res.json();
  if (data.ok && data.user.role === "courier") {
    courierUser = data.user;
    document.getElementById("authCourier").style.display = "none";
    document.getElementById("courierMain").style.display = "block";
    initSignature();
    loadCourierOrders();
    startGeoTrack();
  }
}

function initSignature() {
  const canvas = document.getElementById("signCanvas");
  signCtx = canvas.getContext("2d");
  let draw = false;
  canvas.onmousedown = () => draw = true;
  canvas.onmouseup = () => draw = false;
  canvas.onmousemove = (e) => {
    if (!draw) return;
    const r = canvas.getBoundingClientRect();
    signCtx.fillStyle = "#000";
    signCtx.beginPath();
    signCtx.arc(e.clientX - r.left, e.clientY - r.top, 2, 0, Math.PI * 2);
    signCtx.fill();
  };
}

function clearSign() {
  signCtx.clearRect(0, 0, 300, 150);
}

async function loadCourierOrders() {
  const orders = await (await fetch("/api/orders")).json();
  const my = orders.filter(x => x.courierId == courierUser.courierId);
  const cont = document.getElementById("courierOrders");
  cont.innerHTML = "";
  my.forEach(o => {
    cont.innerHTML += `
      <div class="card" onclick="openOrder(${o.id})">
        ${o.status}<br>${o.pointA} → ${o.pointB}
      </div>
    `;
  });
}

async function openOrder(id) {
  const orders = await (await fetch("/api/orders")).json();
  activeOrder = orders.find(x => x.id === id);
  document.getElementById("detailTitle").innerText = `Заказ #${id}`;
  document.getElementById("detailAddr").innerText = activeOrder.pointB;
  document.getElementById("orderDetail").style.display = "block";
}

function buildRoute() {
  const a = encodeURIComponent(activeOrder.pointB);
  window.open(`https://navigator.yandex.ru/?rtext=~${a}`, "_blank");
}

async function uploadPhoto() {
  const f = document.getElementById("cargoPhoto").files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("photo", f);
  const res = await fetch("/api/upload-photo", { method: "POST", body: fd });
  const d = await res.json();
  await fetch(`/api/orders/${activeOrder.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photoUrl: d.url })
  });
}

async function updateStatus(st) {
  await fetch(`/api/orders/${activeOrder.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: st })
  });
  loadCourierOrders();
}

async function setStatusArrive() { await updateStatus("arrived"); }
async function setStatusPick() { await uploadPhoto(); await updateStatus("picked"); }
async function setStatusOnWay() { await updateStatus("onway"); }
async function setStatusDelivered() { await updateStatus("done"); }

function startGeoTrack() {
  setInterval(() => {
    navigator.geolocation.getCurrentPosition(p => {
      fetch(`/api/couriers/${courierUser.courierId}/geo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: p.coords.latitude, lon: p.coords.longitude })
      });
    });
  }, 5000);
}