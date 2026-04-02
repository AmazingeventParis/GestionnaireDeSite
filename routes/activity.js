const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');

// GET / — paginated audit log
router.get('/', verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('site_manager_audit_log')
      .select('*, site_manager_users(username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Editors can only see their own activity
    if (req.user.role !== 'admin') {
      query = query.eq('user_id', req.user.id);
    } else {
      // Admin can filter by user_id
      if (req.query.user_id) {
        query = query.eq('user_id', req.query.user_id);
      }
    }

    if (req.query.action) {
      query = query.eq('action', req.query.action);
    }
    if (req.query.entity_type) {
      query = query.eq('entity_type', req.query.entity_type);
    }
    if (req.query.from) {
      query = query.gte('created_at', req.query.from);
    }
    if (req.query.to) {
      query = query.lte('created_at', req.query.to);
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation du journal' });
    }

    // Flatten username
    const entries = (data || []).map(function(entry) {
      const username = entry.site_manager_users ? entry.site_manager_users.username : null;
      const { site_manager_users, ...rest } = entry;
      return { ...rest, username };
    });

    res.json({
      entries,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    console.error('[Activity] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /stats — count actions by type for last 7 days
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('site_manager_audit_log')
      .select('action')
      .gte('created_at', since7d);

    // Editors see only their own stats
    if (req.user.role !== 'admin') {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des stats' });
    }

    const byAction = {};
    if (data) {
      for (const entry of data) {
        byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      }
    }

    res.json({
      period: '7d',
      total: data ? data.length : 0,
      byAction
    });
  } catch (err) {
    console.error('[Activity] Stats error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
