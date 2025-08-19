
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import Datastore from '@seald-io/nedb';
import fs from 'fs';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = process.env.PORT || 8080;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'devkey';

// Middleware
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(morgan('tiny'));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(cors());
app.set('etag', false);

// Databases
fs.mkdirSync(path.join(__dirname, 'data'), {recursive:true});
const db = {
  products: new Datastore({ filename: path.join(__dirname, 'data', 'products.db'), autoload: true }),
  rfqs: new Datastore({ filename: path.join(__dirname, 'data', 'rfqs.db'), autoload: true }),
  offers: new Datastore({ filename: path.join(__dirname, 'data', 'offers.db'), autoload: true }),
  orders: new Datastore({ filename: path.join(__dirname, 'data', 'orders.db'), autoload: true }),
};

// Ensure indexes
db.products.ensureIndex({ fieldName: 'id', unique: true });
db.rfqs.ensureIndex({ fieldName: 'id', unique: true });
db.offers.ensureIndex({ fieldName: 'id', unique: true });
db.offers.ensureIndex({ fieldName: 'rfq_id' });
db.orders.ensureIndex({ fieldName: 'id', unique: true });

// Seed
function uuid(){ return crypto.randomUUID(); }
function seed() {
  db.products.count({}, (err, n) => {
    if (n === 0) {
      const now = new Date();
      const sample = [
        {species:'Лосось', form:'Свежая', price:7.80, min:200, stock:4200, loc:'Мурманск', seller:'PolarSea', rating:4.8, updated:'1 ч назад'},
        {species:'Треска', form:'Мороженая', price:3.60, min:300, stock:6000, loc:'Архангельск', seller:'NordFish', rating:4.6, updated:'2 ч назад'},
        {species:'Кета', form:'Охлаждённая', price:4.10, min:150, stock:3500, loc:'Петропавловск-Камчатский', seller:'KamSeafood', rating:4.7, updated:'35 мин назад'},
        {species:'Тунец', form:'Филе', price:9.40, min:100, stock:2500, loc:'Владивосток', seller:'FarEast Blue', rating:4.5, updated:'сегодня'},
        {species:'Сёмга', form:'Филе', price:8.90, min:200, stock:1600, loc:'Мурманск', seller:'PolarSea', rating:4.8, updated:'1 ч назад'},
        {species:'Минтай', form:'Мороженая', price:2.25, min:500, stock:10000, loc:'Находка', seller:'OceanPrime', rating:4.3, updated:'вчера'},
        {species:'Хек', form:'Свежая', price:3.45, min:200, stock:3000, loc:'Калининград', seller:'Baltic Fishers', rating:4.2, updated:'3 ч назад'},
        {species:'Форель', form:'Охлаждённая', price:6.70, min:120, stock:2000, loc:'Карелия', seller:'Karelia Aqua', rating:4.9, updated:'20 мин назад'},
      ].map(p => ({...p, id:'p_'+uuid(), createdAt: now}));
      db.products.insert(sample);
      console.log('Seeded products:', sample.length);
    }
  });
}
seed();

// Helpers
function requireAdmin(req, res, next) {
  const token = req.headers['x-api-key'];
  if (token && token === ADMIN_TOKEN) return next();
  return res.status(401).json({error:'Unauthorized'});
}

// API routes
const api = express.Router();

api.get('/health', (req, res)=> res.json({ ok:true, time:new Date().toISOString() }));

// Products
api.get('/products', (req, res) => {
  const { q, species, sort } = req.query;
  const filter = {};
  if (species) filter.species = species;
  db.products.find(filter, (err, docs) => {
    if (err) return res.status(500).json({error: err.message});
    let list = docs;
    if (q) {
      const s = String(q).toLowerCase();
      list = list.filter(p => [p.species, p.form, p.loc, p.seller].some(v => String(v).toLowerCase().includes(s)));
    }
    if (sort === 'priceAsc') list.sort((a,b)=>a.price-b.price);
    if (sort === 'priceDesc') list.sort((a,b)=>b.price-a.price);
    if (sort === 'freshFirst') list.sort((a,b)=> (a.form==='Свежая'?0:1) - (b.form==='Свежая'?0:1) || a.price-b.price );
    if (sort === 'ratingDesc') list.sort((a,b)=> b.rating-a.rating );
    res.json(list);
  });
});

api.post('/lots', requireAdmin, (req, res) => {
  const p = req.body || {};
  const lot = {
    id: 'p_'+uuid(),
    species: p.species,
    form: p.form,
    price: Number(p.price),
    min: Number(p.min),
    stock: Number(p.stock),
    loc: p.loc,
    seller: p.seller || 'Мой завод',
    rating: Number(p.rating || 4.6),
    updated: 'только что',
    createdAt: new Date()
  };
  db.products.insert(lot, (err, doc)=>{
    if (err) return res.status(400).json({error: err.message});
    res.json(doc);
  });
});

api.get('/lots', (req,res)=>{
  db.products.find({}, (err, docs)=>{
    if (err) return res.status(500).json({error: err.message});
    res.json(docs);
  });
});

// RFQs
api.get('/rfqs', (req,res)=>{
  db.rfqs.find({}).sort({createdAt:-1}).exec((err, docs)=>{
    if (err) return res.status(500).json({error: err.message});
    // attach offers count
    const ids = docs.map(d=>d.id);
    db.offers.find({ rfq_id: { $in: ids } }, (err2, offers)=>{
      const map = offers.reduce((m,o)=>{ (m[o.rfq_id]=m[o.rfq_id]||[]).push(o); return m; }, {});
      res.json(docs.map(d=>({...d, offers: map[d.id] || [] })));
    });
  });
});

api.post('/rfqs', (req,res)=>{
  const b = req.body || {};
  const rfq = {
    id: 'R'+Date.now(),
    species: b.species,
    qty: Number(b.qty),
    loc: b.loc,
    target: b.target ? Number(b.target) : null,
    date: b.date,
    note: b.note,
    status: 'Открыт',
    createdAt: new Date()
  };
  db.rfqs.insert(rfq, (err, doc)=>{
    if (err) return res.status(400).json({error: err.message});
    res.json(doc);
  });
});

api.post('/rfqs/:id/offers', requireAdmin, (req,res)=>{
  const rfq_id = req.params.id;
  const o = req.body || {};
  const offer = {
    id: 'OF'+Date.now()+Math.floor(Math.random()*1000),
    rfq_id,
    price: Number(o.price),
    delivery: o.delivery,
    note: o.note,
    createdAt: new Date()
  };
  db.offers.insert(offer, (err, doc)=>{
    if (err) return res.status(400).json({error: err.message});
    // update RFQ status
    db.rfqs.update({id: rfq_id}, {$set: {status:'Есть предложения'}}, {}, ()=>{});
    res.json(doc);
  });
});

// Orders
api.get('/orders', (req,res)=>{
  db.orders.find({}).sort({createdAt:-1}).exec((err, docs)=>{
    if (err) return res.status(500).json({error: err.message});
    res.json(docs);
  });
});
api.post('/orders', (req,res)=>{
  const b = req.body || {};
  const order = {
    id: 'O'+Date.now(),
    items: b.items || [],
    total: Number(b.total || 0),
    date: new Date().toISOString(),
    status: 'Создан',
    createdAt: new Date()
  };
  db.orders.insert(order, (err, doc)=>{
    if (err) return res.status(400).json({error: err.message});
    res.json(doc);
  });
});

app.use('/api', api);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => {
  console.log(`FishTrade MVP running on port ${PORT}`);
});
