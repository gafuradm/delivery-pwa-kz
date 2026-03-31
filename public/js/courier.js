let courierUser = null;
let activeOrder = null;
let signCtx;

async function courierAuth(){
    const login = document.getElementById("cLogin").value;
    const pass = document.getElementById("cPass").value;
    const r = await fetch("/api/auth",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({login,pass})
    });
    const d = await r.json();
    if(d.ok && d.user.role==="courier"){
        courierUser = d.user;
        document.getElementById("authCourier").style.display="none";
        document.getElementById("courierMain").style.display="block";
        initSignature();
        loadCourierOrders();
        startGeoTrack();
    }
}

function initSignature(){
    const canvas = document.getElementById("signCanvas");
    signCtx = canvas.getContext("2d");
    let draw = false;
    canvas.addEventListener("mousedown",e=>draw=true);
    canvas.addEventListener("mouseup",()=>draw=false);
    canvas.addEventListener("mousemove",e=>{
        if(!draw)return;
        const rect = canvas.getBoundingClientRect();
        signCtx.fillStyle="#000";
        signCtx.beginPath();
        signCtx.arc(e.clientX-rect.left,e.clientY-rect.top,2,0,Math.PI*2);
        signCtx.fill();
    });
}
function clearSign(){signCtx.clearRect(0,0,300,150);}

async function loadCourierOrders(){
    const res = await fetch("/api/orders");
    const orders = await res.json();
    const my = orders.filter(x=>x.courierId === courierUser.courierId);
    const cont = document.getElementById("courierOrders");
    cont.innerHTML="";
    my.forEach(o=>{
        cont.innerHTML += `
        <div class="card" onclick="openOrder(${o.id})">
            <p>${o.status}</p>
            <p>${o.pointA} → ${o.pointB}</p>
        </div>
        `;
    });
}

async function openOrder(id){
    const res = await fetch("/api/orders");
    const orders = await res.json();
    activeOrder = orders.find(x=>x.id===id);
    document.getElementById("detailTitle").innerText = `Заказ #${id}`;
    document.getElementById("detailAddr").innerText = activeOrder.pointB;
    document.getElementById("orderDetail").style.display="block";
}

function buildRoute(){
    if(!activeOrder)return;
    const addr = encodeURIComponent(activeOrder.pointB);
    window.open(`https://navigator.yandex.ru/?rtext=~${addr}`,"_blank");
}

async function setStatusArrive(){await updateOrderStatus("arrived");}
async function setStatusPick(){await updateOrderStatus("picked");}
async function setStatusOnWay(){await updateOrderStatus("onway");}
async function setStatusDelivered(){await updateOrderStatus("done");}

async function updateOrderStatus(st){
    await fetch(`/api/orders/${activeOrder.id}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({status:st})
    });
    alert("Статус обновлен");
    loadCourierOrders();
}

function startGeoTrack(){
    if(!navigator.geolocation)return;
    setInterval(()=>{
        navigator.geolocation.getCurrentPosition(pos=>{
            fetch(`/api/couriers/${courierUser.courierId}/geo`,{
                method:"PATCH",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({lat:pos.coords.latitude,lon:pos.coords.longitude})
            });
        });
    },5000);
}