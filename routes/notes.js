const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validator');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

// GET /site/:siteId - get notes by site
router.get('/site/:siteId', verifyToken, validate({ params: schemas.siteIdParam }), async (req, res) => {
  try {
    const { data: notes, error } = await supabase
      .from('site_manager_notes')
      .select('*')
      .eq('site_id', req.params.siteId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des notes' });
    }

    res.json({ notes });
  } catch (err) {
    console.error('[Notes] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / - create note (editor + admin)
router.post('/', verifyToken, requireRole('admin', 'editor'), validate({ body: schemas.noteSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: note, error } = await supabase
      .from('site_manager_notes')
      .insert({ ...req.body, created_by: req.user.id })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation de la note', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'create',
      entityType: 'note',
      entityId: note.id,
      details: { site_id: note.site_id, type: note.type },
      ip,
      userAgent
    });

    res.status(201).json({ note });
  } catch (err) {
    console.error('[Notes] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id - delete note (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validate({ params: schemas.uuidParam }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: note, error } = await supabase
      .from('site_manager_notes')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !note) {
      return res.status(404).json({ error: 'Note non trouvee' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'delete',
      entityType: 'note',
      entityId: req.params.id,
      ip,
      userAgent
    });

    res.json({ message: 'Note supprimee', note });
  } catch (err) {
    console.error('[Notes] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
