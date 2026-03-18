const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validator');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

// GET /site/:siteId - get contacts by site
router.get('/site/:siteId', verifyToken, validate({ params: schemas.siteIdParam }), async (req, res) => {
  try {
    const { data: contacts, error } = await supabase
      .from('site_manager_contacts')
      .select('*')
      .eq('site_id', req.params.siteId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des contacts' });
    }

    res.json({ contacts });
  } catch (err) {
    console.error('[Contacts] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / - create contact (editor + admin)
router.post('/', verifyToken, requireRole('admin', 'editor'), validate({ body: schemas.contactSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: contact, error } = await supabase
      .from('site_manager_contacts')
      .insert({ ...req.body, created_by: req.user.id })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation du contact', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'create',
      entityType: 'contact',
      entityId: contact.id,
      details: { site_id: contact.site_id, name: contact.name },
      ip,
      userAgent
    });

    res.status(201).json({ contact });
  } catch (err) {
    console.error('[Contacts] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id - delete contact (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validate({ params: schemas.uuidParam }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: contact, error } = await supabase
      .from('site_manager_contacts')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !contact) {
      return res.status(404).json({ error: 'Contact non trouve' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'delete',
      entityType: 'contact',
      entityId: req.params.id,
      details: { name: contact.name },
      ip,
      userAgent
    });

    res.json({ message: 'Contact supprime', contact });
  } catch (err) {
    console.error('[Contacts] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
