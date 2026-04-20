const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const RESULTS_FILE = path.join(__dirname, '..', 'data', 'puppeteer-audit.json');

// Ensure data dir exists
if (!fs.existsSync(path.dirname(RESULTS_FILE))) {
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
}

// GET /api/puppeteer-audit — retrieve stored results
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

// POST /api/puppeteer-audit — save audit results
router.post('/', verifyToken, requireRole('admin'), function(req, res) {
  const { pages, auditDate } = req.body;
  if (!Array.isArray(pages)) return res.status(400).json({ error: 'pages[] requis' });
  const data = { auditDate: auditDate || new Date().toISOString(), totalPages: pages.length, pages };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, totalPages: pages.length });
});

module.exports = router;
