/**
 * Role-Based Access Control middleware
 * Usage: router.get('/admin-only', requireRole('admin'), handler)
 * Usage: router.get('/editors', requireRole('admin', 'editor'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifie' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    next();
  };
}

/**
 * Permission definitions by role
 */
const PERMISSIONS = {
  admin: [
    'view_dashboard', 'view_pages', 'edit_pages', 'publish_pages',
    'upload_media', 'manage_settings', 'manage_header', 'manage_footer',
    'manage_navigation', 'view_credentials', 'manage_sites',
    'deploy', 'manage_users', 'view_security_logs', 'view_activity',
    'manage_bans', 'manage_backups', 'manage_redirections', 'schedule_publish',
    'responsive_preview'
  ],
  editor: [
    'view_dashboard', 'view_pages', 'edit_pages',
    'upload_media', 'view_activity_own', 'schedule_publish',
    'responsive_preview'
  ],
  viewer: [
    'view_dashboard', 'view_pages', 'responsive_preview'
  ]
};

/**
 * Check specific permission
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifie' });
    }
    const userPerms = PERMISSIONS[req.user.role] || [];
    if (!userPerms.includes(permission)) {
      return res.status(403).json({ error: 'Permission insuffisante: ' + permission });
    }
    next();
  };
}

module.exports = { requireRole, requirePermission, PERMISSIONS };
