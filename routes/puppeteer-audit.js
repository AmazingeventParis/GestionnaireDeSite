const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'puppeteer-audit.json');
const HISTORY_FILE = path.join(DATA_DIR, 'puppeteer-audit-history.json');
const AUDITS_DIR = path.join(DATA_DIR, 'puppeteer-audits');

[DATA_DIR, AUDITS_DIR].forEach(function(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── In-memory SSE state ──────────────────────────────────────────────────────
var sseClients = [];
var currentProgress = null;

function broadcastProgress(data) {
  currentProgress = data;
  var payload = 'data: ' + JSON.stringify(data) + '\n\n';
  sseClients = sseClients.filter(function(client) {
    try {
      client.write(payload);
      if (typeof client.flush === 'function') client.flush();
      return true;
    } catch (e) { return false; }
  });
}

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

// GET /api/puppeteer-audit — latest results
router.get('/', verifyToken, requireRole('admin'), function(req, res) {
  if (!fs.existsSync(RESULTS_FILE)) {
    return res.json({ results: null, auditDate: null, totalPages: 0 });
  }
  try {
    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Impossible de lire les résultats' });
  }
});

// GET /api/puppeteer-audit/history — list of past audits (metadata)
router.get('/history', verifyToken, requireRole('admin'), function(req, res) {
  res.json(readHistory());
});

// GET /api/puppeteer-audit/history/:id — full data for one past audit
router.get('/history/:id', verifyToken, requireRole('admin'), function(req, res) {
  const file = path.join(AUDITS_DIR, req.params.id + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Audit introuvable' });
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    res.status(500).json({ error: 'Impossible de lire l\'audit' });
  }
});

// GET /api/puppeteer-audit/progress/stream — SSE endpoint for browser
router.get('/progress/stream', verifyToken, requireRole('admin'), function(req, res) {
  // Disable compression for SSE (compression middleware buffers responses)
  req.headers['accept-encoding'] = 'identity';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(data) {
    try {
      res.write('data: ' + JSON.stringify(data) + '\n\n');
      if (typeof res.flush === 'function') res.flush();
    } catch (e) {}
  }

  // Send current state immediately
  send(currentProgress || { status: 'idle' });
  sseClients.push(res);

  // Heartbeat every 15s to keep connection alive
  var heartbeat = setInterval(function() {
    try {
      res.write(': ping\n\n');
      if (typeof res.flush === 'function') res.flush();
    } catch (e) { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', function() {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(function(c) { return c !== res; });
  });
});

// POST /api/puppeteer-audit/progress — script sends progress updates
router.post('/progress', verifyToken, requireRole('admin'), function(req, res) {
  broadcastProgress(req.body);
  res.json({ ok: true });
});

// POST /api/puppeteer-audit — save full audit results
router.post('/', verifyToken, requireRole('admin'), function(req, res) {
  const body = req.body;
  if (!Array.isArray(body.pages)) return res.status(400).json({ error: 'pages[] requis' });

  const id = Date.now().toString();
  const data = {
    id,
    auditDate: body.createdAt || body.auditDate || new Date().toISOString(),
    totalPages: body.pages.length,
    duration: body.duration || null,
    avgScore: body.avgScore || null,
    stats: body.stats || null,
    global: body.global || null,
    pages: body.pages
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(path.join(AUDITS_DIR, id + '.json'), JSON.stringify(data, null, 2), 'utf8');

  const history = readHistory();
  history.unshift({
    id,
    auditDate: data.auditDate,
    totalPages: data.totalPages,
    avgScore: data.avgScore,
    duration: data.duration,
    stats: data.stats
  });
  if (history.length > 20) history.splice(20);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');

  // Reset progress state
  broadcastProgress({ status: 'done', index: data.totalPages, total: data.totalPages, avgScore: data.avgScore });

  res.json({ success: true, id, totalPages: body.pages.length });
});

module.exports = router;
