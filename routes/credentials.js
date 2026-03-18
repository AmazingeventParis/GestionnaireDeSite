const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validator');
const { logAudit } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/crypto');
const { getClientIp } = require('../middleware/threatDetector');

// GET /site/:siteId - get credentials by site
// Admin sees decrypted passwords, editor/viewer sees masked
router.get('/site/:siteId', verifyToken, validate({ params: schemas.siteIdParam }), async (req, res) => {
  try {
    const { data: credentials, error } = await supabase
      .from('site_manager_credentials')
      .select('*')
      .eq('site_id', req.params.siteId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des identifiants' });
    }

    // Process passwords based on role
    const processed = credentials.map(cred => {
      if (req.user.role === 'admin') {
        return {
          ...cred,
          password_encrypted: cred.password_encrypted ? decrypt(cred.password_encrypted) : null
        };
      }
      return {
        ...cred,
        password_encrypted: cred.password_encrypted ? '********' : null
      };
    });

    res.json({ credentials: processed });
  } catch (err) {
    console.error('[Credentials] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / - create credential (admin only)
router.post('/', verifyToken, requireRole('admin'), validate({ body: schemas.credentialSchema }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const body = { ...req.body, created_by: req.user.id };

    // Encrypt password before storing
    if (body.password_encrypted) {
      body.password_encrypted = encrypt(body.password_encrypted);
    }

    const { data: credential, error } = await supabase
      .from('site_manager_credentials')
      .insert(body)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation de l\'identifiant', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'create',
      entityType: 'credential',
      entityId: credential.id,
      details: { site_id: credential.site_id, service: credential.service },
      ip,
      userAgent
    });

    res.status(201).json({ credential: { ...credential, password_encrypted: '********' } });
  } catch (err) {
    console.error('[Credentials] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id - delete credential (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validate({ params: schemas.uuidParam }), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: credential, error } = await supabase
      .from('site_manager_credentials')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !credential) {
      return res.status(404).json({ error: 'Identifiant non trouve' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'delete',
      entityType: 'credential',
      entityId: req.params.id,
      details: { service: credential.service },
      ip,
      userAgent
    });

    res.json({ message: 'Identifiant supprime' });
  } catch (err) {
    console.error('[Credentials] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
