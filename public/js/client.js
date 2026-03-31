let userData = null;
let baseUrl = "";

async function auth() {
    const login = document.getElementById("login").value;
    const pass = document.getElementById("pass").value;
    const res = await fetch("/api/auth", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({login,pass})
    });
    const data = await res.json();
    if(data.ok){
        userData = data.user;
        document.getElementById("authBlock").style.display = "none";
        document.getElementById("clientMain").style.display = "block";
        loadMyOrders();
        initYandexMap();
    }else alert("Неверный логин/пароль");
}

document.getElementById("warehouse").addEventListener("change",function(){
    const custom = document.getElementById("customWarehouse");
    custom.style.display = this.value === "custom" ? "block":"none";
});

function calcPrice(){
    let weight = Number(document.getElementById("weight").value);
    let urgent = Number(document.getElementById("urgent").value);
    let base = 1500;
    let sum = Math.round((base + weight * 200) * urgent);
    document.getElementById("priceRes").innerText = sum + " тенге";
}

async function createOrder(){
    calcPrice();
    const warehouse = document.getElementById("warehouse").value === "custom"
        ? document.getElementById("customWarehouse").value
        : document.getElementById("warehouse").value;

    const order = {
        pointA: warehouse,
        pointB: document.getElementById("clientAddr").value,
        weight: document.getElementById("weight").value,
        size: document.getElementById("size").value,
        cargoType: document.getElementById("cargoType").value,
        urgentCoef: document.getElementById("urgent").value,
        date: document.getElementById("dateSel").value,
        timeSlot: document.getElementById("timeSlot").value,
        priceText: document.getElementById("priceRes").innerText,
        status:"new",
        clientLogin: userData.login
    };

    await fetch("/api/orders",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(order)
    });
    alert("Заказ оформлен! Оплата произведена");
    loadMyOrders();
}

async function loadMyOrders(){
    const res = await fetch("/api/orders");
    const orders = await res.json();
    const my = orders.filter(x=>x.clientLogin === userData.login);
    const cont = document.getElementById("ordersList");
    cont.innerHTML = "";

    my.forEach(o=>{
        let statusText = "";
        let cls = "";
        switch(o.status){
            case "new": statusText="✅ Заказ принят";cls="status-yellow";break;
            case "assigned": statusText="🚗 Курьер назначен";cls="status-blue";break;
            case "picked": statusText="📦 Забран со склада";cls="status-blue";break;
            case "onway": statusText="🧭 В пути";cls="status-blue";break;
            case "done": statusText="🏠 Доставлен";cls="status-green";break;
            case "late": statusText="⏰ Опоздание";cls="status-red";break;
        }
        cont.innerHTML += `
        <div class="card ${cls}">
            <p>${statusText}</p>
            <p>От: ${o.pointA}</p>
            <p>Куда: ${o.pointB}</p>
            <p>${o.priceText}</p>
        </div>
        `;
    });
}