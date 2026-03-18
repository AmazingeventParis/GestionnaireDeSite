const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const http = require('http');
const https = require('https');

// GET / — list all monitors with site name
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data: monitors, error } = await supabase
      .from('site_manager_monitors')
      .select('*, site_manager_sites(name, url)')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des moniteurs' });
    }

    // Flatten site name into monitor object
    const result = (monitors || []).map(function(m) {
      const siteName = m.site_manager_sites ? m.site_manager_sites.name : null;
      const siteUrl = m.site_manager_sites ? m.site_manager_sites.url : null;
      const { site_manager_sites, ...rest } = m;
      return { ...rest, site_name: siteName, site_url: siteUrl };
    });

    res.json({ monitors: result });
  } catch (err) {
    console.error('[Monitoring] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /check — trigger immediate check for all monitors
router.post('/check', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: monitors, error } = await supabase
      .from('site_manager_monitors')
      .select('*');

    if (error || !monitors) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des moniteurs' });
    }

    const results = [];

    for (const monitor of monitors) {
      const url = monitor.url;
      if (!url) continue;

      const result = await checkUrl(url);

      // Update monitor in database
      await supabase
        .from('site_manager_monitors')
        .update({
          last_check: new Date().toISOString(),
          last_status: result.status,
          last_response_ms: result.responseTime,
          is_up: result.isUp
        })
        .eq('id', monitor.id);

      results.push({
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        is_up: result.isUp,
        status: result.status,
        response_ms: result.responseTime
      });
    }

    res.json({ results });
  } catch (err) {
    console.error('[Monitoring] Check error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /history — recent monitor-related audit log entries
router.get('/history', verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('site_manager_audit_log')
      .select('*', { count: 'exact' })
      .ilike('action', '%monitor%')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation de l\'historique' });
    }

    res.json({
      entries: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    console.error('[Monitoring] History error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Check a URL and return status, response time, and up/down status
 */
function checkUrl(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const client = url.startsWith('https') ? https : http;

    const req = client.request(url, { method: 'GET', timeout: 15000 }, (response) => {
      const responseTime = Date.now() - start;
      const isUp = response.statusCode >= 200 && response.statusCode < 400;
      // Consume response to free up socket
      response.resume();
      resolve({
        status: response.statusCode,
        responseTime,
        isUp
      });
    });

    req.on('error', () => {
      resolve({
        status: 0,
        responseTime: Date.now() - start,
        isUp: false
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        responseTime: Date.now() - start,
        isUp: false
      });
    });

    req.end();
  });
}

module.exports = router;
