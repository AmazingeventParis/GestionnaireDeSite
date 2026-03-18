const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validator');
const { logAudit, logLoginAttempt } = require('../utils/audit');
const { verifyPassword, generateTokens, hashToken, verifyRefreshToken } = require('../utils/crypto');
const { getClientIp } = require('../middleware/threatDetector');
const { loginLimiter } = require('../middleware/rateLimiter');

// Progressive lockout thresholds
const LOCKOUT_THRESHOLDS = [
  { attempts: 15, duration: 24 * 60 * 60 * 1000 },  // 15 attempts = 24h
  { attempts: 10, duration: 60 * 60 * 1000 },         // 10 attempts = 1h
  { attempts: 5, duration: 15 * 60 * 1000 }            // 5 attempts = 15min
];

/**
 * Check progressive lockout based on recent failed login attempts
 */
async function checkLockout(email) {
  // Check last 24h of failed attempts
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: attempts } = await supabase
    .from('site_manager_login_attempts')
    .select('created_at')
    .eq('email', email)
    .eq('success', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (!attempts || attempts.length === 0) return null;

  for (const threshold of LOCKOUT_THRESHOLDS) {
    if (attempts.length >= threshold.attempts) {
      const lastAttempt = new Date(attempts[0].created_at);
      const lockoutEnd = new Date(lastAttempt.getTime() + threshold.duration);
      if (Date.now() < lockoutEnd.getTime()) {
        const remainingMs = lockoutEnd.getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return { locked: true, remainingMin };
      }
    }
  }

  return null;
}

// POST /login
router.post('/login', loginLimiter, validate({ body: schemas.loginSchema }), async (req, res) => {
  const { email, password, remember } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    // Check progressive lockout
    const lockout = await checkLockout(email);
    if (lockout && lockout.locked) {
      await logLoginAttempt({ email, ip, success: false, userAgent });
      return res.status(429).json({
        error: `Compte temporairement verrouille. Reessayez dans ${lockout.remainingMin} minute(s).`
      });
    }

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('site_manager_users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !user) {
      await logLoginAttempt({ email, ip, success: false, userAgent });
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!user.is_active) {
      await logLoginAttempt({ email, ip, success: false, userAgent });
      return res.status(403).json({ error: 'Compte desactive' });
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await logLoginAttempt({ email, ip, success: false, userAgent });
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Generate tokens
    const tokens = generateTokens(user, remember);
    const tokenHash = hashToken(tokens.refreshToken);

    // Create session
    const expiresAt = new Date(Date.now() + (remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000));
    await supabase.from('site_manager_sessions').insert({
      user_id: user.id,
      token_hash: tokenHash,
      ip_address: ip,
      user_agent: userAgent,
      expires_at: expiresAt.toISOString()
    });

    // Update last_login and login_count
    await supabase
      .from('site_manager_users')
      .update({
        last_login: new Date().toISOString(),
        login_count: (user.login_count || 0) + 1
      })
      .eq('id', user.id);

    // Set cookies
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
    });

    // Log audit and login attempt
    await logLoginAttempt({ email, ip, success: true, userAgent });
    await logAudit({
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      details: { remember },
      ip,
      userAgent
    });

    res.json({
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      accessToken: tokens.accessToken
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /refresh
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies && req.cookies.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token manquant' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Refresh token invalide' });
    }

    // Verify session exists in DB
    const tokenHash = hashToken(refreshToken);
    const { data: session } = await supabase
      .from('site_manager_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session) {
      return res.status(401).json({ error: 'Session invalide ou expiree' });
    }

    // Fetch user separately
    const { data: user } = await supabase
      .from('site_manager_users')
      .select('id, email, role, username, is_active')
      .eq('id', session.user_id)
      .single();

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Utilisateur non trouve ou desactive' });
    }
    const tokens = generateTokens(user, false);

    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000
    });

    res.json({ accessToken: tokens.accessToken });
  } catch (err) {
    console.error('[Auth] Refresh error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /logout
router.post('/logout', verifyToken, async (req, res) => {
  const refreshToken = req.cookies && req.cookies.refresh_token;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  try {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await supabase
        .from('site_manager_sessions')
        .delete()
        .eq('token_hash', tokenHash);
    }

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    await logAudit({
      userId: req.user.id,
      action: 'logout',
      entityType: 'user',
      entityId: req.user.id,
      ip,
      userAgent
    });

    res.json({ message: 'Deconnexion reussie' });
  } catch (err) {
    console.error('[Auth] Logout error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('site_manager_users')
      .select('id, email, username, role, is_active, last_login, login_count, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouve' });
    }

    res.json({ user });
  } catch (err) {
    console.error('[Auth] Me error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
