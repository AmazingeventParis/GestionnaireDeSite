const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { getClientIp } = require('../middleware/threatDetector');

// GET / — list redirections (paginated)
router.get('/', verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const { data: redirections, error, count } = await supabase
      .from('site_manager_redirections')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des redirections' });
    }

    res.json({ redirections, total: count, page, limit });
  } catch (err) {
    console.error('[Redirections] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — create redirection
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { source_path, target_path, status_code } = req.body;

    // Validate source starts with /
    if (!source_path || !source_path.startsWith('/')) {
      return res.status(400).json({ error: 'Le chemin source doit commencer par /' });
    }

    if (!target_path) {
      return res.status(400).json({ error: 'Le chemin cible est requis' });
    }

    const code = parseInt(status_code) || 301;
    if (code !== 301 && code !== 302) {
      return res.status(400).json({ error: 'Le code de statut doit etre 301 ou 302' });
    }

    // Check for duplicate source_path
    const { data: existing } = await supabase
      .from('site_manager_redirections')
      .select('id')
      .eq('source_path', source_path)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Une redirection existe deja pour ce chemin source' });
    }

    const { data: redirection, error } = await supabase
      .from('site_manager_redirections')
      .insert({
        source_path,
        target_path,
        status_code: code,
        is_active: true,
        hit_count: 0,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation de la redirection', details: error.message });
    }

    // Invalidate redirect cache
    try {
      const { invalidateRedirectCache } = require('../middleware/redirectHandler');
      invalidateRedirectCache();
    } catch (e) { /* middleware may not be loaded */ }

    await logAudit({
      userId: req.user.id,
      action: 'redirection_create',
      entityType: 'redirection',
      entityId: redirection.id,
      details: { source_path, target_path, status_code: code },
      ip,
      userAgent
    });

    res.status(201).json(redirection);
  } catch (err) {
    console.error('[Redirections] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id — update redirection
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { source_path, target_path, status_code, is_active } = req.body;
    const updates = {};

    if (source_path !== undefined) {
      if (!source_path.startsWith('/')) {
        return res.status(400).json({ error: 'Le chemin source doit commencer par /' });
      }
      updates.source_path = source_path;
    }

    if (target_path !== undefined) {
      updates.target_path = target_path;
    }

    if (status_code !== undefined) {
      const code = parseInt(status_code);
      if (code !== 301 && code !== 302) {
        return res.status(400).json({ error: 'Le code de statut doit etre 301 ou 302' });
      }
      updates.status_code = code;
    }

    if (is_active !== undefined) {
      updates.is_active = Boolean(is_active);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune donnee a mettre a jour' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: redirection, error } = await supabase
      .from('site_manager_redirections')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !redirection) {
      return res.status(404).json({ error: 'Redirection non trouvee' });
    }

    // Invalidate redirect cache
    try {
      const { invalidateRedirectCache } = require('../middleware/redirectHandler');
      invalidateRedirectCache();
    } catch (e) { /* middleware may not be loaded */ }

    await logAudit({
      userId: req.user.id,
      action: 'redirection_update',
      entityType: 'redirection',
      entityId: redirection.id,
      details: updates,
      ip,
      userAgent
    });

    res.json(redirection);
  } catch (err) {
    console.error('[Redirections] Update error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id — delete redirection
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { data: redirection, error: fetchError } = await supabase
      .from('site_manager_redirections')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !redirection) {
      return res.status(404).json({ error: 'Redirection non trouvee' });
    }

    const { error } = await supabase
      .from('site_manager_redirections')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    // Invalidate redirect cache
    try {
      const { invalidateRedirectCache } = require('../middleware/redirectHandler');
      invalidateRedirectCache();
    } catch (e) { /* middleware may not be loaded */ }

    await logAudit({
      userId: req.user.id,
      action: 'redirection_delete',
      entityType: 'redirection',
      entityId: redirection.id,
      details: { source_path: redirection.source_path, target_path: redirection.target_path },
      ip,
      userAgent
    });

    res.json({ message: 'Redirection supprimee' });
  } catch (err) {
    console.error('[Redirections] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /import — import redirections from CSV
router.post('/import', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { csv } = req.body;

    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'Le champ csv est requis (texte CSV)' });
    }

    const lines = csv.trim().split('\n').filter(line => line.trim());
    const redirections = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(',').map(s => s.trim());
      if (parts.length < 2) {
        errors.push({ line: i + 1, error: 'Format invalide, attendu: source,target[,code]' });
        continue;
      }

      const source_path = parts[0];
      const target_path = parts[1];
      const status_code = parseInt(parts[2]) || 301;

      if (!source_path.startsWith('/')) {
        errors.push({ line: i + 1, error: 'Le chemin source doit commencer par /' });
        continue;
      }

      if (status_code !== 301 && status_code !== 302) {
        errors.push({ line: i + 1, error: 'Le code de statut doit etre 301 ou 302' });
        continue;
      }

      redirections.push({
        source_path,
        target_path,
        status_code,
        is_active: true,
        hit_count: 0,
        created_by: req.user.id
      });
    }

    if (redirections.length === 0) {
      return res.status(400).json({ error: 'Aucune redirection valide trouvee', errors });
    }

    const { data: inserted, error } = await supabase
      .from('site_manager_redirections')
      .insert(redirections)
      .select();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de l\'import', details: error.message });
    }

    // Invalidate redirect cache
    try {
      const { invalidateRedirectCache } = require('../middleware/redirectHandler');
      invalidateRedirectCache();
    } catch (e) { /* middleware may not be loaded */ }

    await logAudit({
      userId: req.user.id,
      action: 'redirection_import',
      entityType: 'redirection',
      entityId: null,
      details: { imported: inserted.length, errors: errors.length },
      ip,
      userAgent
    });

    res.status(201).json({
      message: `${inserted.length} redirection(s) importee(s)`,
      imported: inserted.length,
      errors
    });
  } catch (err) {
    console.error('[Redirections] Import error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
