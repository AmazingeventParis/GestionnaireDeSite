const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const RESULTS_FILE = path.join(__dirname, '..', 'data', 'performance-results.json');

// GET / — return latest performance data
router.get('/', verifyToken, async (req, res) => {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
      res.json(data);
    } else {
      res.json({ results: null, message: 'Aucun test effectue' });
    }
  } catch (err) {
    console.error('[Performance] Read error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /run — run a basic performance check
router.post('/run', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'site-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const domain = config.deploy && config.deploy.domain;

    if (!domain) {
      return res.status(400).json({ error: 'Aucun domaine configure dans site-config.json' });
    }

    const url = domain.startsWith('http') ? domain : 'https://' + domain;
    const metrics = await measurePerformance(url);

    const results = {
      url,
      timestamp: new Date().toISOString(),
      ttfb_ms: metrics.ttfb,
      page_size_bytes: metrics.pageSize,
      page_size_kb: Math.round(metrics.pageSize / 1024 * 100) / 100,
      resource_count: metrics.resourceCount,
      status_code: metrics.statusCode,
      load_time_ms: metrics.loadTime
    };

    // Ensure data directory exists
    const dataDir = path.dirname(RESULTS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(RESULTS_FILE, JSON.stringify({ results, history: getHistory(results) }, null, 2));

    res.json({ results });
  } catch (err) {
    console.error('[Performance] Run error:', err.message);
    res.status(500).json({ error: 'Erreur lors du test: ' + err.message });
  }
});

/**
 * Measure basic performance metrics via HTTP
 */
function measurePerformance(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    let ttfb = 0;

    const req = client.request(url, { method: 'GET', timeout: 30000 }, (response) => {
      ttfb = Date.now() - startTime;

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const loadTime = Date.now() - startTime;
        const body = Buffer.concat(chunks);
        const html = body.toString('utf8');
        const pageSize = body.length;

        // Count resources: scripts, stylesheets, images, iframes
        const scriptCount = (html.match(/<script[\s>]/gi) || []).length;
        const linkCount = (html.match(/<link[^>]+rel=["']stylesheet["']/gi) || []).length;
        const imgCount = (html.match(/<img[\s>]/gi) || []).length;
        const iframeCount = (html.match(/<iframe[\s>]/gi) || []).length;
        const resourceCount = scriptCount + linkCount + imgCount + iframeCount;

        resolve({
          ttfb,
          pageSize,
          resourceCount,
          statusCode: response.statusCode,
          loadTime
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Maintain a small history of performance runs (last 20)
 */
function getHistory(newResult) {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
      const history = existing.history || [];
      history.unshift(newResult);
      return history.slice(0, 20);
    }
  } catch (e) {
    // ignore
  }
  return [newResult];
}

module.exports = router;
