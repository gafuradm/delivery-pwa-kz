async function auth() {
    const login = document.getElementById("login").value;
    const pass = document.getElementById("pass").value;
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, pass })
    });
    const data = await res.json();
    if (data.ok && data.user.role === "client") {
      document.getElementById("auth").style.display = "none";
      document.getElementById("clientPanel").style.display = "block";
      initYandexMap();
      loadMyOrders();
    }
  }
  
  function calcPrice() {
    const weight = Number(document.getElementById("weight").value) || 0;
    const urgent = Number(document.getElementById("urgent").value);
    const base = 1500;
    const sum = Math.round((base + weight * 200) * urgent);
    document.getElementById("priceRes").innerText = sum;
  }
  
  async function createOrder() {
    const pointA = document.getElementById("pointA").value;
    const pointB = document.getElementById("pointB").value;
    const weight = document.getElementById("weight").value;
    const price = document.getElementById("priceRes").innerText;
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pointA, pointB, weight, priceText: price + " тг" })
    });
    alert("Заказ создан!");
    loadMyOrders();
  }
  
  async function loadMyOrders() {
    const res = await fetch("/api/orders");
    const orders = await res.json();
    const list = document.getElementById("ordersList");
    list.innerHTML = "";
    orders.forEach(o => {
      list.innerHTML += `<div class="card">${o.status} | ${o.pointA} → ${o.pointB}</div>`;
    });
  }