const { verifyAccessToken, verifyRefreshToken, generateTokens, hashToken } = require('../utils/crypto');
const supabase = require('../lib/supabase');

/**
 * Verify JWT and attach user to request
 * Checks Authorization header first, then access_token cookie
 * Also accepts static GDS_API_SECRET via X-Api-Key header (machine-to-machine, no expiration)
 */
async function verifyToken(req, res, next) {
  // Static API key check (machine-to-machine, no expiration)
  const apiKey = req.headers['x-api-key'];
  if (apiKey && process.env.GDS_API_SECRET && apiKey === process.env.GDS_API_SECRET) {
    req.user = { id: 'api', email: 'api@gds', role: 'admin', username: 'api' };
    return next();
  }

  let token = null;

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback to cookie
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    // No access token — try refresh token before rejecting
    const refreshTokenDirect = req.cookies && req.cookies.refresh_token;
    if (refreshTokenDirect) {
      const refreshDecodedDirect = verifyRefreshToken(refreshTokenDirect);
      if (refreshDecodedDirect) {
        const tokenHashDirect = hashToken(refreshTokenDirect);
        const { data: sessionDirect } = await supabase
          .from('site_manager_sessions')
          .select('*')
          .eq('token_hash', tokenHashDirect)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (sessionDirect) {
          const { data: userDirect } = await supabase
            .from('site_manager_users')
            .select('id, email, role, username, is_active')
            .eq('id', sessionDirect.user_id)
            .single();

          if (userDirect && userDirect.is_active) {
            const tokensDirect = generateTokens(userDirect, false);
            res.cookie('access_token', tokensDirect.accessToken, {
              httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000
            });
            req.user = { id: userDirect.id, email: userDirect.email, role: userDirect.role, username: userDirect.username };
            return next();
          }
        }
      }
    }
    return res.status(401).json({ error: 'Token manquant' });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    // Try refresh
    const refreshToken = req.cookies && req.cookies.refresh_token;
    if (refreshToken) {
      const refreshDecoded = verifyRefreshToken(refreshToken);
      if (refreshDecoded) {
        // Verify session exists in DB
        const tokenHash = hashToken(refreshToken);
        const { data: session } = await supabase
          .from('site_manager_sessions')
          .select('*')
          .eq('token_hash', tokenHash)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (session) {
          // Fetch user separately
          const { data: sessionUser } = await supabase
            .from('site_manager_users')
            .select('id, email, role, username, is_active')
            .eq('id', session.user_id)
            .single();

          if (sessionUser && sessionUser.is_active) {
            const tokens = generateTokens(sessionUser, false);
            res.cookie('access_token', tokens.accessToken, {
              httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000
            });
            req.user = { id: sessionUser.id, email: sessionUser.email, role: sessionUser.role, username: sessionUser.username };
            return next();
          }
        }
      }
    }
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }

  // Verify user is still active
  const { data: user } = await supabase
    .from('site_manager_users')
    .select('id, email, role, username, is_active')
    .eq('id', decoded.id)
    .single();

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Compte desactive' });
  }

  req.user = { id: user.id, email: user.email, role: user.role, username: user.username };
  next();
}

/**
 * Optional auth - sets req.user if token present, but doesn't reject
 */
async function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.user = { id: decoded.id, email: decoded.email, role: decoded.role };
    }
  }

  req.user = req.user || null;
  next();
}

module.exports = { verifyToken, optionalAuth };
