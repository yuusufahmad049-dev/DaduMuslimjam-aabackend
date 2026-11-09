'use strict';
// Dadu Muslim Students Jam'aa Sector - backend (Node.js + SQLite, no npm packages needed)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'jamaa.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sectors(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, roles TEXT NOT NULL,
  ord INTEGER NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subleaders(
  sector_id TEXT NOT NULL, gender TEXT NOT NULL, name TEXT DEFAULT '', phone TEXT DEFAULT '',
  PRIMARY KEY(sector_id, gender));
CREATE TABLE IF NOT EXISTS members(
  id INTEGER PRIMARY KEY AUTOINCREMENT, sector_id TEXT NOT NULL, gender TEXT NOT NULL,
  name TEXT NOT NULL, dept TEXT DEFAULT '', year TEXT DEFAULT '',
  from_place TEXT DEFAULT '', phone TEXT DEFAULT '');
`);

// ---- First-time data: sectors, roles and default PINs (change PINs after login) ----
const SEED = [
  ['lead', 'Leadership Sector', '1000', ['Oversee all sectors and set the jam’aa’s vision and plans', 'Chair meetings and approve decisions and activities', 'Coordinate and supervise sub-leaders of every sector', 'Represent the jam’aa to the university and the community']],
  ['vice', 'Vice Leadership', '1001', ['Assist the leader in all duties and act in the leader’s absence', 'Follow up the work and reports of every sector', 'Help coordinate meetings, plans and activities', 'Handle tasks delegated by the leadership']],
  ['fin', 'Financial Sector', '2001', ['Collect and record contributions and donations', 'Prepare budgets and keep financial reports', 'Spend funds only with leadership approval', 'Report income and expenses to members regularly']],
  ['ziy', 'Ziyara Sector', '2002', ['Visit sick members and students in need', 'Organize visits to families, elders and communities', 'Support members in hardship and bereavement']],
  ['soc', 'Social Affairs Sector', '2003', ['Strengthen brotherhood and sisterhood among members', 'Organize events, welcomes and farewells', 'Solve social problems between members']],
  ['caf', 'Caffee Sector', '2004', ['Manage the jam’aa café and its services', 'Prepare refreshments for programs and meetings', 'Keep café stock, hygiene and accounts in order']],
  ['aca', 'Academy Sector', '2005', ['Organize tutoring, study groups and exam support', 'Run Qur’an, Islamic studies and skills classes', 'Help new students with academic guidance']],
  ['daw', 'Da’awa Sector', '2006', ['Plan lectures, halaqas and da’awa campaigns', 'Invite and guide students with wisdom and good manners', 'Prepare speakers, materials and outreach programs']],
];
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
if (db.prepare('SELECT COUNT(*) AS c FROM sectors').get().c === 0) {
  SEED.forEach(([id, name, pin, roles], i) => {
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO sectors(id,name,roles,ord,salt,pin_hash) VALUES(?,?,?,?,?,?)')
      .run(id, name, JSON.stringify(roles), i, salt, hashPin(pin, salt));
    ['male', 'female'].forEach(g => db.prepare('INSERT INTO subleaders(sector_id,gender) VALUES(?,?)').run(id, g));
  });
}

// ---- Helpers ----
const GENDERS = ['male', 'female'];
const sessions = new Map(); // token -> {sector, exp}
const fails = new Map();    // ip -> {n, until}
const clean = (v, n = 100) => String(v == null ? '' : v).trim().slice(0, n);
const sectorExists = id => !!db.prepare('SELECT 1 FROM sectors WHERE id=?').get(id);
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise((ok, no) => {
  let d = '';
  req.on('data', c => { d += c; if (d.length > 1e5) { no(new Error('Request too large')); req.destroy(); } });
  req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { no(new Error('Bad request')); } });
});
const authOf = req => {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { sessions.delete(t); return null; }
  return { token: t, sector: s.sector };
};
const can = (a, sector) => !!a && (a.sector === 'lead' || a.sector === sector);
const memberRow = r => ({ id: r.id, gender: r.gender, name: r.name, dept: r.dept, year: r.year, from: r.from_place, phone: r.phone });

function listSectors() {
  return db.prepare('SELECT id,name,roles FROM sectors ORDER BY ord').all().map(s => {
    const sub = { male: { n: '', p: '' }, female: { n: '', p: '' } };
    db.prepare('SELECT gender,name,phone FROM subleaders WHERE sector_id=?').all(s.id)
      .forEach(r => { sub[r.gender] = { n: r.name, p: r.phone }; });
    const counts = { male: 0, female: 0 };
    db.prepare('SELECT gender,COUNT(*) AS c FROM members WHERE sector_id=? GROUP BY gender').all(s.id)
      .forEach(r => { counts[r.gender] = r.c; });
    return { id: s.id, name: s.name, roles: JSON.parse(s.roles), sub, counts };
  });
}

// ---- API ----
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  const a = authOf(req);

  if (m === 'GET' && p === '/api/sectors') return send(res, 200, listSectors());

  if (m === 'GET' && p === '/api/members') {
    const sector = url.searchParams.get('sector'), g = url.searchParams.get('gender');
    if (!sectorExists(sector)) return send(res, 404, { error: 'Sector not found' });
    const rows = g && GENDERS.includes(g)
      ? db.prepare('SELECT * FROM members WHERE sector_id=? AND gender=? ORDER BY name COLLATE NOCASE').all(sector, g)
      : db.prepare('SELECT * FROM members WHERE sector_id=? ORDER BY name COLLATE NOCASE').all(sector);
    return send(res, 200, rows.map(memberRow));
  }

  if (m === 'GET' && p === '/api/me') return a ? send(res, 200, { sector: a.sector }) : send(res, 401, { error: 'Not logged in' });

  if (m === 'POST' && p === '/api/login') {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'x', f = fails.get(ip);
    if (f && f.until > Date.now()) return send(res, 429, { error: 'Too many wrong attempts. Try again in 10 minutes.' });
    const b = await readBody(req);
    const s = db.prepare('SELECT id,salt,pin_hash FROM sectors WHERE id=?').get(clean(b.sector));
    const ok = s && crypto.timingSafeEqual(Buffer.from(hashPin(clean(b.pin, 50), s.salt), 'hex'), Buffer.from(s.pin_hash, 'hex'));
    if (!ok) {
      const n = (f ? f.n : 0) + 1;
      fails.set(ip, { n, until: n >= 8 ? Date.now() + 600000 : 0 });
      return send(res, 401, { error: 'Wrong PIN.' });
    }
    fails.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { sector: s.id, exp: Date.now() + 12 * 3600 * 1000 });
    return send(res, 200, { token, sector: s.id });
  }

  if (m === 'POST' && p === '/api/logout') { if (a) sessions.delete(a.token); return send(res, 200, { ok: true }); }

  // Everything below needs login
  if (!a) return send(res, 401, { error: 'Please login first.' });

  if (m === 'POST' && p === '/api/members') {
    const b = await readBody(req), sector = clean(b.sector), g = clean(b.gender), name = clean(b.name);
    if (!sectorExists(sector) || !GENDERS.includes(g)) return send(res, 400, { error: 'Invalid sector or gender' });
    if (!can(a, sector)) return send(res, 403, { error: 'You are not authorized for this sector.' });
    if (!name) return send(res, 400, { error: 'Name is required' });
    const r = db.prepare('INSERT INTO members(sector_id,gender,name,dept,year,from_place,phone) VALUES(?,?,?,?,?,?,?)')
      .run(sector, g, name, clean(b.dept), clean(b.year, 20), clean(b.from), clean(b.phone, 30));
    return send(res, 200, { id: Number(r.lastInsertRowid) });
  }

  let mm = p.match(/^\/api\/members\/(\d+)$/);
  if (mm && (m === 'PUT' || m === 'DELETE')) {
    const row = db.prepare('SELECT * FROM members WHERE id=?').get(Number(mm[1]));
    if (!row) return send(res, 404, { error: 'Member not found' });
    if (!can(a, row.sector_id)) return send(res, 403, { error: 'You are not authorized for this sector.' });
    if (m === 'DELETE') { db.prepare('DELETE FROM members WHERE id=?').run(row.id); return send(res, 200, { ok: true }); }
    const b = await readBody(req), name = clean(b.name);
    if (!name) return send(res, 400, { error: 'Name is required' });
    db.prepare('UPDATE members SET name=?,dept=?,year=?,from_place=?,phone=? WHERE id=?')
      .run(name, clean(b.dept), clean(b.year, 20), clean(b.from), clean(b.phone, 30), row.id);
    return send(res, 200, { ok: true });
  }

  if (m === 'PUT' && p === '/api/sub') {
    const b = await readBody(req), sector = clean(b.sector), g = clean(b.gender);
    if (!sectorExists(sector) || !GENDERS.includes(g)) return send(res, 400, { error: 'Invalid sector or gender' });
    if (!can(a, sector)) return send(res, 403, { error: 'You are not authorized for this sector.' });
    db.prepare('UPDATE subleaders SET name=?,phone=? WHERE sector_id=? AND gender=?').run(clean(b.name), clean(b.phone, 30), sector, g);
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/pin') {
    const b = await readBody(req), sector = clean(b.sector), pin = clean(b.pin, 20);
    if (!sectorExists(sector)) return send(res, 400, { error: 'Invalid sector' });
    if (!can(a, sector)) return send(res, 403, { error: 'You are not authorized for this sector.' });
    if (!/^\d{4,12}$/.test(pin)) return send(res, 400, { error: 'PIN must be 4 to 12 digits.' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE sectors SET salt=?,pin_hash=? WHERE id=?').run(salt, hashPin(pin, salt), sector);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

// ---- Static files ----
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGES = ['index.html', 'style.css', 'script.js']; // only these files are public
function serveStatic(req, res, url) {
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!PAGES.includes(name)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: e.message || 'Error' });
  }
}).listen(PORT, () => console.log('Jam’aa system running at http://localhost:' + PORT));
