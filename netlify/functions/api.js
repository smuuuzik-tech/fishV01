// netlify/functions/api.js
// Мок-API для фронта: продукты, RFQ, офферы и заказы.
// Без БД: данные хранятся в памяти инстанса функции (достаточно для демо).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'devkey';

// --- простая утилита
const json = (status, data, extraHeaders) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', ...extraHeaders },
  body: JSON.stringify(data),
});

// --- сид-данные
let products = [
  { id: 'p1', species:'Лосось',   form:'Свежая',      price:7.80, min:200, stock:4200, loc:'Мурманск', seller:'PolarSea',    rating:4.8, updated:'1 ч назад' },
  { id: 'p2', species:'Треска',   form:'Мороженая',   price:3.60, min:300, stock:6000, loc:'Архангельск', seller:'NordFish',  rating:4.6, updated:'2 ч назад' },
  { id: 'p3', species:'Кета',     form:'Охлаждённая', price:4.10, min:150, stock:3500, loc:'П-Камчатский', seller:'KamSeafood', rating:4.7, updated:'35 мин назад' },
  { id: 'p4', species:'Тунец',    form:'Филе',        price:9.40, min:100, stock:2500, loc:'Владивосток', seller:'FarEast Blue', rating:4.5, updated:'сегодня' },
  { id: 'p5', species:'Сёмга',    form:'Филе',        price:8.90, min:200, stock:1600, loc:'Мурманск', seller:'PolarSea',      rating:4.8, updated:'1 ч назад' },
  { id: 'p6', species:'Минтай',   form:'Мороженая',   price:2.25, min:500, stock:10000,loc:'Находка', seller:'OceanPrime',    rating:4.3, updated:'вчера' },
  { id: 'p7', species:'Хек',      form:'Свежая',      price:3.45, min:200, stock:3000, loc:'Калининград', seller:'Baltic Fishers', rating:4.2, updated:'3 ч назад' },
  { id: 'p8', species:'Форель',   form:'Охлаждённая', price:6.70, min:120, stock:2000, loc:'Карелия', seller:'Karelia Aqua',  rating:4.9, updated:'20 мин назад' },
];
let rfqs   = [];   // {id, species, qty, loc, target, date, note, status}
let offers = [];   // {id, rfq_id, price, delivery, note}
let orders = [];   // {id, items[], total, date, status}

function notAuth() { return json(401, { error: 'Unauthorized' }); }
function parseBody(event) { try { return event.body ? JSON.parse(event.body) : {}; } catch { return {}; } }

exports.handler = async function(event) {
  const method = event.httpMethod;
  // event.path = "/.netlify/functions/api/<splat>"
  const subpath = event.path.replace('/.netlify/functions/api', '') || '/';
  const isAdmin = (event.headers['x-api-key'] || '') === ADMIN_TOKEN;

  // CORS для безопасности (однодоменный сценарий — ок, но пусть будет)
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type,x-api-key',
      },
    };
  }

  // Health
  if (method === 'GET' && subpath === '/health') {
    return json(200, { ok: true, time: new Date().toISOString() });
  }

  // PRODUCTS / LOTS (просмотр)
  if (method === 'GET' && (subpath === '/products' || subpath === '/lots')) {
    const url = new URL(event.rawUrl);
    const q    = (url.searchParams.get('q') || '').toLowerCase();
    const sort = url.searchParams.get('sort') || 'priceAsc';
    let list = products.slice();
    if (q) list = list.filter(p => [p.species,p.form,p.loc,p.seller].some(v => String(v).toLowerCase().includes(q)));
    if (sort==='priceAsc') list.sort((a,b)=>a.price-b.price);
    if (sort==='priceDesc') list.sort((a,b)=>b.price-a.price);
    if (sort==='freshFirst') list.sort((a,b)=>(a.form==='Свежая'?0:1)-(b.form==='Свежая'?0:1)||a.price-b.price);
    if (sort==='ratingDesc') list.sort((a,b)=>b.rating-a.rating);
    return json(200, list);
  }

  // LOTS (создание) — только с ключом
  if (method === 'POST' && subpath === '/lots') {
    if (!isAdmin) return notAuth();
    const b = parseBody(event);
    const id = 'p'+Math.random().toString(36).slice(2,9);
    const lot = {
      id, species:b.species, form:b.form, price:Number(b.price),
      min:Number(b.min), stock:Number(b.stock), loc:b.loc,
      seller:b.seller || 'Мой завод', rating: Number(b.rating || 4.6), updated:'только что'
    };
    products.unshift(lot);
    return json(200, lot);
  }

  // RFQ (список)
  if (method === 'GET' && subpath === '/rfqs') {
    const detailed = rfqs.map(r => ({ ...r, offers: offers.filter(o => o.rfq_id === r.id) }));
    return json(200, detailed);
  }

  // RFQ (создание)
  if (method === 'POST' && subpath === '/rfqs') {
    const b = parseBody(event);
    const rfq = {
      id: 'R'+Date.now(),
      species: b.species, qty:Number(b.qty), loc:b.loc,
      target: b.target ?? null, date:b.date, note:b.note || '',
      status: 'Открыт', createdAt: new Date().toISOString()
    };
    rfqs.unshift(rfq);
    return json(200, rfq);
  }

  // OFFERS (создание ответа на RFQ) — только с ключом
  const offerMatch = subpath.match(/^\/rfqs\/([^/]+)\/offers$/);
  if (offerMatch && method === 'POST') {
    if (!isAdmin) return notAuth();
    const rfqId = offerMatch[1];
    const b = parseBody(event);
    const off = {
      id: 'OF'+Date.now()+Math.floor(Math.random()*1000),
      rfq_id: rfqId, price:Number(b.price), delivery:b.delivery || '', note:b.note || '',
      createdAt: new Date().toISOString()
    };
    offers.push(off);
    const rfq = rfqs.find(r => r.id === rfqId); if (rfq) rfq.status = 'Есть предложения';
    return json(200, off);
  }

  // ORDERS
  if (method === 'GET' && subpath === '/orders') {
    return json(200, orders);
  }
  if (method === 'POST' && subpath === '/orders') {
    const b = parseBody(event);
    const ord = {
      id: 'O'+Date.now(),
      items: b.items || [],
      total: Number(b.total || 0),
      buyer: b.buyer || null,
      date: new Date().toISOString(),
      status: 'Создан'
    };
    orders.unshift(ord);
    return json(200, ord);
  }

  return json(404, { error: 'Not found', path: subpath });
};
