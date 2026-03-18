const router = require('express').Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validator');

// GET /site/:siteId - get monitors by site
router.get('/site/:siteId', verifyToken, validate({ params: schemas.siteIdParam }), async (req, res) => {
  try {
    const { data: monitors, error } = await supabase
      .from('site_manager_monitors')
      .select('*')
      .eq('site_id', req.params.siteId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des moniteurs' });
    }

    res.json({ monitors });
  } catch (err) {
    console.error('[Monitors] List by site error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET / - get all monitors
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data: monitors, error } = await supabase
      .from('site_manager_monitors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la recuperation des moniteurs' });
    }

    res.json({ monitors });
  } catch (err) {
    console.error('[Monitors] List error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
