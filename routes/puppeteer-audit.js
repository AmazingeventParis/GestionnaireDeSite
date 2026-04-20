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

// Ensure dirs exist
[DATA_DIR, AUDITS_DIR].forEach(function(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

// GET /api/puppeteer-audit — retrieve latest stored results
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

// GET /api/puppeteer-audit/history — list of past audits (metadata only)
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

// POST /api/puppeteer-audit — save audit results
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

  // Save as latest
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2), 'utf8');

  // Save full snapshot in audits dir
  fs.writeFileSync(path.join(AUDITS_DIR, id + '.json'), JSON.stringify(data, null, 2), 'utf8');

  // Append metadata to history (keep last 20)
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

  res.json({ success: true, id, totalPages: body.pages.length });
});

module.exports = router;
