const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'site-config.json');
const COOLIFY_HOST = 'http://217.182.89.133:8000';

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// POST / — trigger Coolify deploy
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const config = readConfig();
    const uuid = config.deploy && config.deploy.coolifyUuid;
    const token = config.deploy && config.deploy.coolifyToken;

    if (!uuid || !token) {
      return res.status(400).json({ error: 'Configuration Coolify manquante (coolifyUuid ou coolifyToken)' });
    }

    // Trigger deploy via Coolify API
    const deployUrl = `${COOLIFY_HOST}/api/v1/deploy?uuid=${encodeURIComponent(uuid)}&force=true`;
    const response = await fetch(deployUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const result = await response.json().catch(() => ({ status: response.status }));

    await logAudit({
      userId: req.user.id,
      action: 'deploy',
      entityType: 'application',
      entityId: uuid,
      details: { status: response.status, result },
      ip,
      userAgent
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Erreur lors du deploiement Coolify',
        status: response.status,
        details: result
      });
    }

    res.json({ message: 'Deploiement declenche avec succes', result });
  } catch (err) {
    console.error('[Deploy] Error:', err.message);
    res.status(500).json({ error: 'Erreur lors du deploiement' });
  }
});

// GET /status — check app status via Coolify API
router.get('/status', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const config = readConfig();
    const uuid = config.deploy && config.deploy.coolifyUuid;
    const token = config.deploy && config.deploy.coolifyToken;

    if (!uuid || !token) {
      return res.status(400).json({ error: 'Configuration Coolify manquante' });
    }

    const statusUrl = `${COOLIFY_HOST}/api/v1/applications/${encodeURIComponent(uuid)}`;
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Erreur lors de la verification du statut', status: response.status });
    }

    const data = await response.json();
    res.json({
      uuid: data.uuid || uuid,
      name: data.name || null,
      fqdn: data.fqdn || null,
      status: data.status || 'unknown',
      last_deployment: data.last_deployment_at || null,
      repository: data.git_repository || null
    });
  } catch (err) {
    console.error('[Deploy] Status error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /history — recent deploy entries from audit log
router.get('/history', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { data: entries, error, count } = await supabase
      .from('site_manager_audit_log')
      .select('*', { count: 'exact' })
      .eq('action', 'deploy')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation de l\'historique' });
    }

    res.json({ entries, total: count, page, limit });
  } catch (err) {
    console.error('[Deploy] History error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
