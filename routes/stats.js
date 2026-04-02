const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');

// GET / - dashboard stats
router.get('/', verifyToken, async (req, res) => {
  try {
    // Run all queries in parallel for efficiency
    const [sitesResult, tasksResult, monitorsResult] = await Promise.all([
      supabase.from('site_manager_sites').select('status'),
      supabase.from('site_manager_tasks').select('status'),
      supabase.from('site_manager_monitors').select('is_up')
    ]);

    // Count sites by status
    const sites = sitesResult.data || [];
    const totalSites = sites.length;
    const activeSites = sites.filter(s => s.status === 'active').length;

    // Count tasks by status
    const tasks = tasksResult.data || [];
    const totalTasks = tasks.length;
    const pendingTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress').length;

    // Count monitors by is_up
    const monitors = monitorsResult.data || [];
    const monitorsTotal = monitors.length;
    const monitorsUp = monitors.filter(m => m.is_up === true).length;

    res.json({
      total_sites: totalSites,
      active_sites: activeSites,
      total_tasks: totalTasks,
      pending_tasks: pendingTasks,
      monitors_up: monitorsUp,
      monitors_total: monitorsTotal
    });
  } catch (err) {
    console.error('[Stats] Dashboard error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
