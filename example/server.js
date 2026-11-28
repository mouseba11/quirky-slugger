'use strict';

// Example site for quirky-slugger. No dependencies.
// Paths are based on this file, so the process can be started from any directory.
// Clone: `npm start`. Install: `node node_modules/@mouseba11/quirky-slugger/example/server.js`.
// Then open http://localhost:4000
const http = require('http');
const fs = require('fs');
const path = require('path');
const quirkySlug = require('../index.js');

const PORT = process.env.PORT || 4000;
const MAX_BODY = 512 * 1024;
const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'quirky-slugger.config.json');
const LANGS_DIR = path.join(ROOT, 'langs');
const SAMPLES_PATH = path.join(LANGS_DIR, 'samples.json');

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { cb(e); }
  });
}

function listLangs() {
  return fs.readdirSync(LANGS_DIR)
    .filter((name) => /^[a-z]{2}(-[a-z0-9]+)?\.json$/i.test(name) && name !== 'samples.json')
    .map((name) => {
      const code = name.replace(/\.json$/i, '').toLowerCase();
      let label = code;
      try {
        const pack = JSON.parse(fs.readFileSync(path.join(LANGS_DIR, name), 'utf8'));
        if (pack.locale && pack.locale.label) label = pack.locale.label;
      } catch (e) { /* keep code */ }
      return { code, label };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'index.html')));
  }

  if (req.method === 'GET' && req.url === '/api/config') {
    return send(res, 200, 'application/json; charset=utf-8', fs.readFileSync(CONFIG_PATH));
  }

  if (req.method === 'GET' && req.url === '/api/langs') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(listLangs()));
  }

  if (req.method === 'GET' && req.url === '/api/samples') {
    return send(res, 200, 'application/json; charset=utf-8', fs.readFileSync(SAMPLES_PATH));
  }

  const langMatch = req.method === 'GET' && req.url && req.url.match(/^\/api\/lang\/([a-z]{2}(?:-[a-z0-9]+)?)$/i);
  if (langMatch) {
    const file = path.join(LANGS_DIR, `${langMatch[1].toLowerCase()}.json`);
    if (!fs.existsSync(file)) return send(res, 404, 'application/json', JSON.stringify({ error: 'Unknown language' }));
    return send(res, 200, 'application/json; charset=utf-8', fs.readFileSync(file));
  }

  if (req.method === 'GET' && req.url === '/settings-help.json') {
    return send(res, 200, 'application/json; charset=utf-8', fs.readFileSync(path.join(__dirname, 'settings-help.json')));
  }

  if (req.method === 'POST' && req.url === '/api/slug') {
    return readJson(req, (err, body) => {
      if (err) return send(res, 400, 'application/json', JSON.stringify({ error: 'Invalid JSON' }));
      try {
        const options = { quirks: Boolean(body.quirks) };
        if (body.seed !== undefined && body.seed !== null && body.seed !== '') options.seed = String(body.seed);
        if (body.lang) options.lang = String(body.lang);
        if (body.config && typeof body.config === 'object' && !Array.isArray(body.config)) options.config = body.config;
        return send(res, 200, 'application/json', JSON.stringify(quirkySlug.explain(body.keywords, body.text, options)));
      } catch (e) {
        return send(res, 400, 'application/json', JSON.stringify({ error: e.message }));
      }
    });
  }

  send(res, 404, 'text/plain', 'Not found');
});

server.on('error', (err) => {
  if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is unavailable (${err.code}). Try another one, e.g. PORT=4001 npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`quirky-slugger example running at http://localhost:${PORT}`);
});
