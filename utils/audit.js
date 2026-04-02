const supabase = require('../lib/supabase');

/**
 * Log an action to the audit trail
 */
async function logAudit({ userId, action, entityType, entityId, details, ip, userAgent }) {
  try {
    await supabase.from('site_manager_audit_log').insert({
      user_id: userId || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || null,
      ip_address: ip || null,
      user_agent: userAgent || null
    });
  } catch (err) {
    console.error('[Audit] Failed to log:', err.message);
  }
}

/**
 * Log a security event
 */
async function logSecurityEvent({ ip, method, path, body, threatType, severity, blocked }) {
  try {
    await supabase.from('site_manager_security_events').insert({
      ip_address: ip,
      request_method: method,
      request_path: path,
      request_body: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500),
      threat_type: threatType,
      severity: severity || 'medium',
      blocked: blocked !== false
    });
  } catch (err) {
    console.error('[Security] Failed to log event:', err.message);
  }
}

/**
 * Log a login attempt
 */
async function logLoginAttempt({ email, ip, success, userAgent }) {
  try {
    await supabase.from('site_manager_login_attempts').insert({
      email,
      ip_address: ip,
      success,
      user_agent: userAgent
    });
  } catch (err) {
    console.error('[Login] Failed to log attempt:', err.message);
  }
}

module.exports = { logAudit, logSecurityEvent, logLoginAttempt };
