const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAINTENANCE_FILE = path.join(PUBLIC_DIR, 'maintenance.html');

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance en cours</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .container {
            text-align: center;
            max-width: 500px;
            padding: 40px;
        }
        .icon { font-size: 64px; margin-bottom: 24px; }
        h1 { font-size: 28px; margin-bottom: 12px; color: #58a6ff; }
        p { font-size: 16px; color: #8b949e; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">&#9888;&#65039;</div>
        <h1>Maintenance en cours</h1>
        <p>Le site est actuellement en maintenance. Nous serons de retour tres bientot.</p>
    </div>
</body>
</html>`;

// POST / — create scheduled publish
router.post('/', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { page_slug, scheduled_at } = req.body;

    if (!page_slug) {
      return res.status(400).json({ error: 'Le slug de la page est requis' });
    }

    if (!scheduled_at) {
      return res.status(400).json({ error: 'La date de publication est requise' });
    }

    // Validate date
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Date invalide' });
    }

    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'La date doit etre dans le futur' });
    }

    const { data: schedule, error } = await supabase
      .from('site_manager_scheduled_publishes')
      .insert({
        page_slug,
        scheduled_at: scheduledDate.toISOString(),
        status: 'pending',
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la planification', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'schedule_create',
      entityType: 'scheduled_publish',
      entityId: schedule.id,
      details: { page_slug, scheduled_at: scheduledDate.toISOString() },
      ip,
      userAgent
    });

    res.status(201).json(schedule);
  } catch (err) {
    console.error('[Schedule] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET / — list scheduled publishes
router.get('/', verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { data: schedules, error, count } = await supabase
      .from('site_manager_scheduled_publishes')
      .select('*', { count: 'exact' })
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des planifications' });
    }

    res.json({ schedules, total: count, page, limit });
  } catch (err) {
    console.error('[Schedule] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id — cancel scheduled publish
router.delete('/:id', verifyToken, requireRole('admin', 'editor'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: schedule, error: fetchError } = await supabase
      .from('site_manager_scheduled_publishes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !schedule) {
      return res.status(404).json({ error: 'Publication planifiee non trouvee' });
    }

    if (schedule.status !== 'pending') {
      return res.status(400).json({ error: 'Seules les publications en attente peuvent etre annulees' });
    }

    const { data: updated, error } = await supabase
      .from('site_manager_scheduled_publishes')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de l\'annulation' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'schedule_cancel',
      entityType: 'scheduled_publish',
      entityId: schedule.id,
      details: { page_slug: schedule.page_slug },
      ip,
      userAgent
    });

    res.json(updated);
  } catch (err) {
    console.error('[Schedule] Cancel error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /maintenance — toggle maintenance mode
router.post('/maintenance', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const maintenanceActive = fs.existsSync(MAINTENANCE_FILE);

    if (maintenanceActive) {
      // Disable maintenance mode
      fs.unlinkSync(MAINTENANCE_FILE);

      await logAudit({
        userId: req.user.id,
        action: 'maintenance_off',
        entityType: 'system',
        entityId: null,
        details: { status: 'disabled' },
        ip,
        userAgent
      });

      res.json({ maintenance: false, message: 'Mode maintenance desactive' });
    } else {
      // Enable maintenance mode
      fs.writeFileSync(MAINTENANCE_FILE, MAINTENANCE_HTML, 'utf-8');

      await logAudit({
        userId: req.user.id,
        action: 'maintenance_on',
        entityType: 'system',
        entityId: null,
        details: { status: 'enabled' },
        ip,
        userAgent
      });

      res.json({ maintenance: true, message: 'Mode maintenance active' });
    }
  } catch (err) {
    console.error('[Schedule] Maintenance toggle error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /maintenance — check maintenance status
router.get('/maintenance', verifyToken, async (req, res) => {
  try {
    const active = fs.existsSync(MAINTENANCE_FILE);
    res.json({ maintenance: active });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
