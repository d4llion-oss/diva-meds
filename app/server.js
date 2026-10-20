// Diva's Daily Meds — tiny shared-state server (no dependencies).
// Data: one JSON file on a mounted volume. Access: a shared key carried in the link.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'log.json');
const EDIT_KEY = process.env.EDIT_KEY;
const TZ = process.env.TZ || 'America/Chicago';
const ROLLOVER_HOUR = 3; // med day runs 3 AM → 3 AM local
const COURSE = { start: process.env.COURSE_START || '2026-10-19', days: Number(process.env.COURSE_DAYS || 14) };
const DOSE_IDS = new Set(['m08', 'c14', 'g16', 'r20', 'g24', 'c26']);

if (!EDIT_KEY || EDIT_KEY.length < 12) { console.error('Set EDIT_KEY (12+ chars) in the environment.'); process.exit(1); }
fs.mkdirSync(DATA_DIR, { recursive: true });

let log = {};
try { log = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { log = {}; }
function persist() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(log, null, 1));
  fs.renameSync(tmp, DATA_FILE); // atomic swap
}

// Local (Chicago) wall-clock parts for a timestamp, independent of the host TZ.
function localParts(ts) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
  const o = Object.fromEntries(f.formatToParts(new Date(ts)).map(p => [p.type, p.value]));
  return { key: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour) % 24 };
}
function medDayKey(ts) { return localParts(ts - ROLLOVER_HOUR * 3600e3).key; }

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const PAGE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 4096) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" });
    return res.end(PAGE);
  }
  if (url.pathname === '/healthz') return json(res, 200, { ok: true });

  if (url.pathname.startsWith('/api/')) {
    const key = req.headers['x-diva-key'];
    if (!key || !safeEq(key, EDIT_KEY)) return json(res, 401, { error: 'bad key' });

    if (req.method === 'GET' && url.pathname === '/api/log') {
      return json(res, 200, { log, now: Date.now(), today: medDayKey(Date.now()), course: COURSE, tz: TZ });
    }
    if (req.method === 'POST' && url.pathname === '/api/check') {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'bad body' }); }
      const { dose, action } = body;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day || '') ? body.day : medDayKey(Date.now());
      if (!DOSE_IDS.has(dose) || !['set', 'clear'].includes(action)) return json(res, 400, { error: 'bad dose/action' });
      const by = String(body.by || '').replace(/[^\w .'-]/g, '').slice(0, 24);
      log[day] = log[day] || {};
      if (action === 'set') { if (!log[day][dose]) log[day][dose] = { ts: Date.now(), by }; }
      else { delete log[day][dose]; if (!Object.keys(log[day]).length) delete log[day]; }
      persist();
      return json(res, 200, { log, now: Date.now(), today: medDayKey(Date.now()), course: COURSE, tz: TZ });
    }
    return json(res, 404, { error: 'not found' });
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`Diva meds listening on :${PORT} (TZ ${TZ}, data ${DATA_FILE})`));
