const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Путь к базам JSON
const DB_ORDERS = path.join(__dirname, 'db/orders.json');
const DB_COURIERS = path.join(__dirname, 'db/couriers.json');
const DB_USERS = path.join(__dirname, 'db/users.json');

// Инициализация пустых БД если нет файлов
async function initDB(){
  if(!await fs.pathExists(DB_ORDERS)) await fs.writeJSON(DB_ORDERS, []);
  if(!await fs.pathExists(DB_COURIERS)) await fs.writeJSON(DB_COURIERS, [
    {id:1,name:"Ержан",phone:"+77001112233",photo:"courier1.png",car:"Toyota Camry",plate:"KZ 123 ABC",lat:43.25,lon:76.95,free:true}
  ]);
  if(!await fs.pathExists(DB_USERS)) await fs.writeJSON(DB_USERS, [
    {login:"client",pass:"123",role:"client"},
    {login:"courier1",pass:"123",role:"courier",courierId:1},
    {login:"admin",pass:"123",role:"admin"}
  ]);
}
initDB();

// API Авторизация
app.post('/api/auth', async (req,res)=>{
  const users = await fs.readJSON(DB_USERS);
  const {login,pass} = req.body;
  const u = users.find(x=>x.login===login && x.pass===pass);
  if(u) return res.json({ok:true,user:u});
  res.json({ok:false});
});

// API Заказы CRUD
app.get('/api/orders', async (req,res)=>{
  const data = await fs.readJSON(DB_ORDERS);
  res.json(data);
});
app.post('/api/orders', async (req,res)=>{
  const orders = await fs.readJSON(DB_ORDERS);
  const newOrder = {
    id: Date.now(),
    ...req.body,
    status:"new",
    createdAt: new Date().toISOString()
  };
  orders.push(newOrder);
  await fs.writeJSON(DB_ORDERS, orders, {spaces:2});
  res.json(newOrder);
});
app.patch('/api/orders/:id', async (req,res)=>{
  let orders = await fs.readJSON(DB_ORDERS);
  const idx = orders.findIndex(x=>x.id===Number(req.params.id));
  if(idx>-1){
    orders[idx] = {...orders[idx],...req.body};
    await fs.writeJSON(DB_ORDERS, orders, {spaces:2});
    res.json(orders[idx]);
  }else res.status(404).json({err:"not found"});
});

// Курьеры API
app.get('/api/couriers', async (req,res)=>{
  const data = await fs.readJSON(DB_COURIERS);
  res.json(data);
});
app.patch('/api/couriers/:id/geo', async (req,res)=>{
  let couriers = await fs.readJSON(DB_COURIERS);
  const idx = couriers.findIndex(x=>x.id===Number(req.params.id));
  if(idx>-1){
    couriers[idx].lat = req.body.lat;
    couriers[idx].lon = req.body.lon;
    await fs.writeJSON(DB_COURIERS, couriers, {spaces:2});
    res.json(couriers[idx]);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});