const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validator');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

// Priority order for sorting
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

// GET /site/:siteId - get tasks by site
router.get('/site/:siteId', verifyToken, validate({ params: schemas.siteIdParam }), async (req, res) => {
  try {
    const { data: tasks, error } = await supabase
      .from('site_manager_tasks')
      .select('*')
      .eq('site_id', req.params.siteId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des taches' });
    }

    res.json({ tasks });
  } catch (err) {
    console.error('[Tasks] List by site error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET / - get all tasks with pagination, sorted by priority
router.get('/', verifyToken, validate({ query: schemas.paginationQuery }), async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const offset = (page - 1) * limit;

    const { data: tasks, error, count } = await supabase
      .from('site_manager_tasks')
      .select('*', { count: 'exact' })
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des taches' });
    }

    res.json({
      tasks,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    console.error('[Tasks] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / - create task (editor + admin)
router.post('/', verifyToken, requireRole('admin', 'editor'), validate({ body: schemas.taskSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: task, error } = await supabase
      .from('site_manager_tasks')
      .insert({ ...req.body, created_by: req.user.id })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation de la tache', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'create',
      entityType: 'task',
      entityId: task.id,
      details: { title: task.title, site_id: task.site_id },
      ip,
      userAgent
    });

    res.status(201).json({ task });
  } catch (err) {
    console.error('[Tasks] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id - update task (editor + admin)
router.put('/:id', verifyToken, requireRole('admin', 'editor'), validate({ params: schemas.uuidParam, body: schemas.taskUpdateSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: task, error } = await supabase
      .from('site_manager_tasks')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !task) {
      return res.status(404).json({ error: 'Tache non trouvee ou erreur de mise a jour' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'update',
      entityType: 'task',
      entityId: task.id,
      details: { fields: Object.keys(req.body) },
      ip,
      userAgent
    });

    res.json({ task });
  } catch (err) {
    console.error('[Tasks] Update error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id - delete task (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validate({ params: schemas.uuidParam }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: task, error } = await supabase
      .from('site_manager_tasks')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !task) {
      return res.status(404).json({ error: 'Tache non trouvee' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'delete',
      entityType: 'task',
      entityId: req.params.id,
      details: { title: task.title },
      ip,
      userAgent
    });

    res.json({ message: 'Tache supprimee', task });
  } catch (err) {
    console.error('[Tasks] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
