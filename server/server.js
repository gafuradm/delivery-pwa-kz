const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const uploadDir = path.join(__dirname, '../public/uploads');
fs.ensureDirSync(uploadDir);
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({ storage });

const DB_ORDERS = path.join(__dirname, 'db/orders.json');
const DB_COURIERS = path.join(__dirname, 'db/couriers.json');
const DB_USERS = path.join(__dirname, 'db/users.json');

async function initDB() {
  if (!await fs.pathExists(DB_ORDERS)) await fs.writeJSON(DB_ORDERS, []);
  if (!await fs.pathExists(DB_COURIERS)) await fs.writeJSON(DB_COURIERS, [
    { id: 1, name: "Ержан", phone: "+77001112233", lat: 43.25, lon: 76.95, free: true }
  ]);
  if (!await fs.pathExists(DB_USERS)) await fs.writeJSON(DB_USERS, [
    { login: "client", pass: "123", role: "client" },
    { login: "courier1", pass: "123", role: "courier", courierId: 1 },
    { login: "admin", pass: "123", role: "admin" }
  ]);
}
initDB();

app.post('/api/auth', async (req, res) => {
  const users = await fs.readJSON(DB_USERS);
  const u = users.find(x => x.login === req.body.login && x.pass === req.body.pass);
  res.json({ ok: !!u, user: u || null });
});

app.get('/api/orders', async (_, res) => {
  res.json(await fs.readJSON(DB_ORDERS));
});

app.post('/api/orders', async (req, res) => {
  const orders = await fs.readJSON(DB_ORDERS);
  const no = { id: Date.now(), ...req.body, status: "new", smsCode: Math.floor(1000 + Math.random() * 9000) };
  orders.push(no);
  await fs.writeJSON(DB_ORDERS, orders, { spaces: 2 });
  res.json(no);
});

app.patch('/api/orders/:id', async (req, res) => {
  let o = await fs.readJSON(DB_ORDERS);
  const i = o.findIndex(x => x.id === Number(req.params.id));
  if (i > -1) {
    o[i] = { ...o[i], ...req.body };
    await fs.writeJSON(DB_ORDERS, o, { spaces: 2 });
    res.json(o[i]);
  } else res.status(404).json({ err: 404 });
});

app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
  res.json({ url: "/uploads/" + req.file.filename });
});

app.get('/api/couriers', async (_, res) => {
  res.json(await fs.readJSON(DB_COURIERS));
});

app.patch('/api/couriers/:id/geo', async (req, res) => {
  let c = await fs.readJSON(DB_COURIERS);
  const i = c.findIndex(x => x.id === Number(req.params.id));
  if (i > -1) {
    c[i].lat = req.body.lat;
    c[i].lon = req.body.lon;
    await fs.writeJSON(DB_COURIERS, c, { spaces: 2 });
    res.json(c[i]);
  }
});

app.get('/api/receipt/:id', async (req, res) => {
  const orders = await fs.readJSON(DB_ORDERS);
  const o = orders.find(x => x.id === Number(req.params.id));
  if (!o) return res.status(404).end();
  res.setHeader('Content-Type', 'application/pdf');
  const doc = new PDFDocument();
  doc.pipe(res);
  doc.text("Заказ #" + o.id);
  doc.text(o.pointA + " → " + o.pointB);
  doc.text(o.priceText);
  doc.end();
});

app.listen(PORT, HOST, () => {
  console.log("Server run 0.0.0.0:" + PORT);
});