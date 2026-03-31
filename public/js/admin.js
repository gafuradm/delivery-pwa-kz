let adminUser = null;
let yaMap;

async function adminAuth(){
    const login = document.getElementById("aLogin").value;
    const pass = document.getElementById("aPass").value;
    const r = await fetch("/api/auth",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({login,pass})
    });
    const d = await r.json();
    if(d.ok && d.user.role==="admin"){
        adminUser = d.user;
        document.getElementById("adminAuth").style.display="none";
        document.getElementById("adminPanel").style.display="block";
        initAdminMap();
        loadAdminData();
    }
}

async function loadAdminData(){
    loadOrdersAdmin();
    loadFinance();
    setTimeout(loadAdminData,10000);
}

async function loadOrdersAdmin(){
    const oRes = await fetch("/api/orders");
    const orders = await oRes.json();
    const cRes = await fetch("/api/couriers");
    const couriers = await cRes.json();

    const cont = document.getElementById("adminOrders");
    cont.innerHTML="";
    orders.forEach(o=>{
        let color = "status-yellow";
        if(o.status==="assigned"||o.status==="picked"||o.status==="onway")color="status-blue";
        if(o.status==="done")color="status-green";
        if(o.status==="late")color="status-red";

        cont.innerHTML += `
        <div class="card ${color}">
            <p>#${o.id} | ${o.status}</p>
            <p>${o.pointA} → ${o.pointB}</p>
            <select id="selCourier${o.id}">
                <option value="">Назначить курьера</option>
                ${couriers.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}
            </select>
            <button onclick="assignCourier(${o.id})">Назначить</button>
        </div>
        `;
    });
}

async function assignCourier(orderId){
    const sel = document.getElementById(`selCourier${orderId}`);
    const cId = Number(sel.value);
    if(!cId)return;
    await fetch(`/api/orders/${orderId}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({courierId:cId,status:"assigned"})
    });
    loadOrdersAdmin();
}

async function loadFinance(){
    const orders = await (await fetch("/api/orders")).json();
    const couriers = await (await fetch("/api/couriers")).json();
    let report = "";
    couriers.forEach(c=>{
        const done = orders.filter(x=>x.courierId===c.id && x.status==="done");
        const salary = done.length * 500 + done.length * 200;
        report += `<p>${c.name}: выполнено ${done.length} заказов | Зарплата: ${salary} тенге</p>`;
    });
    document.getElementById("financeReport").innerHTML = report;
}

function initAdminMap(){
    ymaps.ready(()=>{
        yaMap = new ymaps.Map("map",{center:[43.25,76.95],zoom:12});
    });
}