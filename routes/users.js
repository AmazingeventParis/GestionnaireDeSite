const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../utils/audit');
const { hashPassword } = require('../utils/crypto');
const { getClientIp } = require('../middleware/threatDetector');

// GET / — list users (exclude password_hash)
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('site_manager_users')
      .select('id, email, username, role, is_active, created_at, updated_at, last_login, login_count')
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des utilisateurs' });
    }

    res.json({ users });
  } catch (err) {
    console.error('[Users] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id — get single user with session count
router.get('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('site_manager_users')
      .select('id, email, username, role, is_active, created_at, updated_at, last_login, login_count')
      .eq('id', req.params.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouve' });
    }

    // Get active session count
    const { count } = await supabase
      .from('site_manager_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.params.id)
      .gt('expires_at', new Date().toISOString());

    user.active_sessions = count || 0;

    res.json(user);
  } catch (err) {
    console.error('[Users] Get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — create user
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { email, username, password, role } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, nom d\'utilisateur et mot de passe sont requis' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Format d\'email invalide' });
    }

    // Validate role
    const validRoles = ['admin', 'editor', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role invalide. Roles valides: admin, editor, viewer' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres' });
    }

    // Check for existing user with same email
    const { data: existing } = await supabase
      .from('site_manager_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Un utilisateur avec cet email existe deja' });
    }

    // Check for existing username
    const { data: existingUsername } = await supabase
      .from('site_manager_users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUsername) {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est deja pris' });
    }

    const password_hash = await hashPassword(password);

    const { data: user, error } = await supabase
      .from('site_manager_users')
      .insert({
        email,
        username,
        password_hash,
        role: role || 'viewer',
        is_active: true
      })
      .select('id, email, username, role, is_active, created_at')
      .single();

    if (error) {
      return res.status(400).json({ error: 'Erreur lors de la creation de l\'utilisateur', details: error.message });
    }

    await logAudit({
      userId: req.user.id,
      action: 'user_create',
      entityType: 'user',
      entityId: user.id,
      details: { email, username, role: role || 'viewer' },
      ip,
      userAgent
    });

    res.status(201).json(user);
  } catch (err) {
    console.error('[Users] Create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id — update user
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { email, username, role, is_active, password } = req.body;
    const targetId = req.params.id;

    // Cannot deactivate self
    if (is_active === false && targetId === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas desactiver votre propre compte' });
    }

    // Build updates
    const updates = {};

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Format d\'email invalide' });
      }
      // Check uniqueness
      const { data: existing } = await supabase
        .from('site_manager_users')
        .select('id')
        .eq('email', email)
        .neq('id', targetId)
        .single();
      if (existing) {
        return res.status(409).json({ error: 'Un utilisateur avec cet email existe deja' });
      }
      updates.email = email;
    }

    if (username !== undefined) {
      const { data: existing } = await supabase
        .from('site_manager_users')
        .select('id')
        .eq('username', username)
        .neq('id', targetId)
        .single();
      if (existing) {
        return res.status(409).json({ error: 'Ce nom d\'utilisateur est deja pris' });
      }
      updates.username = username;
    }

    if (role !== undefined) {
      const validRoles = ['admin', 'editor', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Role invalide' });
      }
      updates.role = role;
    }

    if (is_active !== undefined) {
      updates.is_active = Boolean(is_active);
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres' });
      }
      updates.password_hash = await hashPassword(password);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune donnee a mettre a jour' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: user, error } = await supabase
      .from('site_manager_users')
      .update(updates)
      .eq('id', targetId)
      .select('id, email, username, role, is_active, created_at, updated_at')
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouve' });
    }

    // If user was deactivated, revoke all their sessions
    if (is_active === false) {
      await supabase
        .from('site_manager_sessions')
        .delete()
        .eq('user_id', targetId);
    }

    await logAudit({
      userId: req.user.id,
      action: 'user_update',
      entityType: 'user',
      entityId: user.id,
      details: { updated_fields: Object.keys(updates).filter(k => k !== 'password_hash' && k !== 'updated_at') },
      ip,
      userAgent
    });

    res.json(user);
  } catch (err) {
    console.error('[Users] Update error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id — delete user and their sessions
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const targetId = req.params.id;

  try {
    // Cannot delete self
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    // Check user exists
    const { data: user, error: fetchError } = await supabase
      .from('site_manager_users')
      .select('id, email, username')
      .eq('id', targetId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouve' });
    }

    // Delete sessions first
    await supabase
      .from('site_manager_sessions')
      .delete()
      .eq('user_id', targetId);

    // Delete user
    const { error } = await supabase
      .from('site_manager_users')
      .delete()
      .eq('id', targetId);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la suppression de l\'utilisateur' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'user_delete',
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email, username: user.username },
      ip,
      userAgent
    });

    res.json({ message: 'Utilisateur supprime' });
  } catch (err) {
    console.error('[Users] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id/sessions — list active sessions for a user
router.get('/:id/sessions', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from('site_manager_sessions')
      .select('id, ip_address, user_agent, created_at, expires_at')
      .eq('user_id', req.params.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des sessions' });
    }

    res.json({ sessions: sessions || [] });
  } catch (err) {
    console.error('[Users] Sessions list error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id/sessions — revoke all sessions for a user
router.delete('/:id/sessions', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { error } = await supabase
      .from('site_manager_sessions')
      .delete()
      .eq('user_id', req.params.id);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la revocation des sessions' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'sessions_revoke_all',
      entityType: 'user',
      entityId: req.params.id,
      details: { target_user_id: req.params.id },
      ip,
      userAgent
    });

    res.json({ message: 'Toutes les sessions ont ete revoquees' });
  } catch (err) {
    console.error('[Users] Sessions revoke all error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id/sessions/:sessionId — revoke single session
router.delete('/:id/sessions/:sessionId', verifyToken, requireRole('admin'), async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { error } = await supabase
      .from('site_manager_sessions')
      .delete()
      .eq('id', req.params.sessionId)
      .eq('user_id', req.params.id);

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la revocation de la session' });
    }

    await logAudit({
      userId: req.user.id,
      action: 'session_revoke',
      entityType: 'session',
      entityId: req.params.sessionId,
      details: { target_user_id: req.params.id },
      ip,
      userAgent
    });

    res.json({ message: 'Session revoquee' });
  } catch (err) {
    console.error('[Users] Session revoke error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
