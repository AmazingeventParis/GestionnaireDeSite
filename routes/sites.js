const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validator');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

// GET / - list all sites with pagination
router.get('/', verifyToken, validate({ query: schemas.paginationQuery }), async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const offset = (page - 1) * limit;

    const { data: sites, error, count } = await supabase
      .from('site_manager_sites')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des sites' });
    }

    res.json({
      sites,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    console.error('[Sites] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id - get single site
router.get('/:id', verifyToken, validate({ params: schemas.uuidParam }), async (req, res) => {
  try {
    const { data: site, error } = await supabase
      .from('site_manager_sites')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !site) {
      return res.status(404).json({ error: 'Site non trouve' });
    }

    res.json({ site });
  } catch (err) {
    console.error('[Sites] Get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / - create site (admin only)
router.post('/', verifyToken, requireRole('admin'), validate({ body: schemas.siteSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: site, error } = await supabase
      .from('site_manager_sites')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation du site', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'create',
      entityType: 'site',
      entityId: site.id,
      details: { name: site.name, url: site.url },
      ip,
      userAgent
    });

    res.status(201).json({ site });
  } catch (err) {
    console.error('[Sites] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id - update site (admin only)
router.put('/:id', verifyToken, requireRole('admin'), validate({ params: schemas.uuidParam, body: schemas.siteUpdateSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: site, error } = await supabase
      .from('site_manager_sites')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !site) {
      return res.status(404).json({ error: 'Site non trouve ou erreur de mise a jour' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'update',
      entityType: 'site',
      entityId: site.id,
      details: { fields: Object.keys(req.body) },
      ip,
      userAgent
    });

    res.json({ site });
  } catch (err) {
    console.error('[Sites] Update error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id - delete site (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validate({ params: schemas.uuidParam }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: site, error } = await supabase
      .from('site_manager_sites')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !site) {
      return res.status(404).json({ error: 'Site non trouve' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'delete',
      entityType: 'site',
      entityId: req.params.id,
      details: { name: site.name },
      ip,
      userAgent
    });

    res.json({ message: 'Site supprime', site });
  } catch (err) {
    console.error('[Sites] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
