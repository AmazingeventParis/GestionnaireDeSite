const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');
const { invalidateBanCache } = require('../middleware/ipBan');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// All routes require admin
router.use(verifyToken, requireRole('admin'));

// GET /events — paginated security events
router.get('/events', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('site_manager_security_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.threat_type) {
      query = query.eq('threat_type', req.query.threat_type);
    }
    if (req.query.severity) {
      query = query.eq('severity', req.query.severity);
    }
    if (req.query.from) {
      query = query.gte('created_at', req.query.from);
    }
    if (req.query.to) {
      query = query.lte('created_at', req.query.to);
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des evenements' });
    }

    res.json({
      events: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    console.error('[Security] Events error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /stats — aggregated security stats
router.get('/stats', async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [eventsResult, allEventsResult, bansResult] = await Promise.all([
      supabase
        .from('site_manager_security_events')
        .select('id', { count: 'exact' })
        .gte('created_at', since24h),
      supabase
        .from('site_manager_security_events')
        .select('threat_type')
        .gte('created_at', since24h),
      supabase
        .from('site_manager_ip_bans')
        .select('id', { count: 'exact' })
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    ]);

    // Count by threat_type
    const byType = {};
    if (allEventsResult.data) {
      for (const ev of allEventsResult.data) {
        byType[ev.threat_type] = (byType[ev.threat_type] || 0) + 1;
      }
    }

    // SSL check
    let sslInfo = { status: 'unknown', daysUntilExpiry: null, error: null };
    try {
      const configPath = path.join(__dirname, '..', 'site-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const domain = config.deploy && config.deploy.domain;

      if (domain) {
        sslInfo = await new Promise((resolve) => {
          const url = domain.startsWith('http') ? domain : 'https://' + domain;
          const hostname = new URL(url).hostname;

          const reqSSL = https.request({ hostname, port: 443, method: 'HEAD', timeout: 5000 }, (response) => {
            const cert = response.socket.getPeerCertificate();
            if (cert && cert.valid_to) {
              const expiry = new Date(cert.valid_to);
              const days = Math.floor((expiry - Date.now()) / (1000 * 60 * 60 * 24));
              resolve({ status: days > 0 ? 'valid' : 'expired', daysUntilExpiry: days, error: null });
            } else {
              resolve({ status: 'no_cert', daysUntilExpiry: null, error: 'Certificat non disponible' });
            }
          });
          reqSSL.on('error', (e) => resolve({ status: 'error', daysUntilExpiry: null, error: e.message }));
          reqSSL.on('timeout', () => { reqSSL.destroy(); resolve({ status: 'timeout', daysUntilExpiry: null, error: 'Timeout' }); });
          reqSSL.end();
        });
      } else {
        sslInfo = { status: 'no_domain', daysUntilExpiry: null, error: 'Aucun domaine configure' };
      }
    } catch (e) {
      sslInfo = { status: 'error', daysUntilExpiry: null, error: e.message };
    }

    res.json({
      events24h: eventsResult.count || 0,
      byThreatType: byType,
      activeBans: bansResult.count || 0,
      ssl: sslInfo
    });
  } catch (err) {
    console.error('[Security] Stats error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /bans — list active bans
router.get('/bans', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('site_manager_ip_bans')
      .select('*')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des bans' });
    }

    res.json({ bans: data || [] });
  } catch (err) {
    console.error('[Security] Bans list error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /ban — ban an IP
router.post('/ban', async (req, res) => {
  try {
    const { ip_address, reason, duration } = req.body;

    if (!ip_address) {
      return res.status(400).json({ error: 'Adresse IP requise' });
    }

    let expires_at = null;
    if (duration === '1h') {
      expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    } else if (duration === '24h') {
      expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    // 'permanent' or anything else => null (no expiry)

    const { data, error } = await supabase
      .from('site_manager_ip_bans')
      .insert({
        ip_address,
        reason: reason || null,
        expires_at,
        banned_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Erreur lors du ban: ' + error.message });
    }

    invalidateBanCache();

    await logAudit({
      userId: req.user.id,
      action: 'ip_ban',
      entityType: 'ip_ban',
      entityId: data.id,
      details: JSON.stringify({ ip_address, reason, duration }),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ ban: data });
  } catch (err) {
    console.error('[Security] Ban error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /ban/:id — unban
router.delete('/ban/:id', async (req, res) => {
  try {
    // Get ban info before deleting for audit
    const { data: ban } = await supabase
      .from('site_manager_ip_bans')
      .select('*')
      .eq('id', req.params.id)
      .single();

    const { error } = await supabase
      .from('site_manager_ip_bans')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la suppression du ban' });
    }

    invalidateBanCache();

    await logAudit({
      userId: req.user.id,
      action: 'ip_unban',
      entityType: 'ip_ban',
      entityId: req.params.id,
      details: JSON.stringify({ ip_address: ban ? ban.ip_address : 'unknown' }),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Security] Unban error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /headers — security headers self-test
router.get('/headers', async (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'site-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const domain = config.deploy && config.deploy.domain;

    if (!domain) {
      return res.status(400).json({ error: 'Aucun domaine configure dans site-config.json' });
    }

    const url = domain.startsWith('http') ? domain : 'https://' + domain;
    const client = url.startsWith('https') ? https : http;

    const headers = await new Promise((resolve, reject) => {
      const reqH = client.request(url, { method: 'HEAD', timeout: 10000 }, (response) => {
        resolve(response.headers);
      });
      reqH.on('error', reject);
      reqH.on('timeout', () => { reqH.destroy(); reject(new Error('Timeout')); });
      reqH.end();
    });

    const checks = [
      {
        header: 'strict-transport-security',
        name: 'HSTS',
        recommendation: 'Ajouter: Strict-Transport-Security: max-age=31536000; includeSubDomains'
      },
      {
        header: 'x-content-type-options',
        name: 'X-Content-Type-Options',
        recommendation: 'Ajouter: X-Content-Type-Options: nosniff'
      },
      {
        header: 'x-frame-options',
        name: 'X-Frame-Options',
        recommendation: 'Ajouter: X-Frame-Options: DENY ou SAMEORIGIN'
      },
      {
        header: 'content-security-policy',
        name: 'Content-Security-Policy',
        recommendation: 'Ajouter une politique CSP adaptee a votre site'
      },
      {
        header: 'referrer-policy',
        name: 'Referrer-Policy',
        recommendation: 'Ajouter: Referrer-Policy: strict-origin-when-cross-origin'
      }
    ];

    const results = checks.map(function(check) {
      const value = headers[check.header] || null;
      return {
        header: check.name,
        present: !!value,
        value: value || '',
        recommendation: value ? '' : check.recommendation
      };
    });

    res.json({ headers: results });
  } catch (err) {
    console.error('[Security] Headers check error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la verification des headers: ' + err.message });
  }
});

// GET /login-attempts — paginated login attempts
router.get('/login-attempts', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('site_manager_login_attempts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.email) {
      query = query.ilike('email', '%' + req.query.email + '%');
    }
    if (req.query.success !== undefined) {
      query = query.eq('success', req.query.success === 'true');
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des tentatives' });
    }

    res.json({
      attempts: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    console.error('[Security] Login attempts error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
