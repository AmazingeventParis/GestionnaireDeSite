const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { getActiveSite } = require('../middleware/activeSite');

// Legacy fallback path (Shootnbox)
const REVIEWS_PATH_LEGACY = path.join(__dirname, '..', 'previews', '_shared', 'reviews.json');

function getReviewsPath() {
  const site = getActiveSite();
  if (site.isLegacy) return REVIEWS_PATH_LEGACY;
  return path.join(site.sharedDir, 'reviews.json');
}

function loadReviews() {
  const p = getReviewsPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * GET /api/reviews — Public endpoint, returns reviews data for the marquee block
 * CORS open (needed when block is rendered on shootnbox.fr static pages)
 */
router.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const data = loadReviews();
  if (!data) {
    return res.status(404).json({ error: 'Reviews non configurés' });
  }
  res.json(data);
});

/**
 * PUT /api/reviews — Admin: update reviews data (full replace)
 * Body: { rating, totalRatings, googleUrl, placeId, writeReviewUrl, reviews: [...] }
 */
router.put('/', verifyToken, requireRole('admin'), (req, res) => {
  const { rating, totalRatings, googleUrl, placeId, writeReviewUrl, reviews } = req.body;

  if (!Array.isArray(reviews) || reviews.length === 0) {
    return res.status(400).json({ error: 'Le champ "reviews" (tableau) est requis' });
  }

  const data = {
    rating: parseFloat(rating) || 5.0,
    totalRatings: parseInt(totalRatings) || 0,
    googleUrl: googleUrl || '',
    placeId: placeId || '',
    writeReviewUrl: writeReviewUrl || '',
    reviews: reviews.map(r => ({
      author: r.author || '',
      avatar: r.avatar || null,
      rating: parseInt(r.rating) || 5,
      time: r.time || '',
      text: r.text || ''
    }))
  };

  try {
    const p = getReviewsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, count: data.reviews.length });
  } catch (err) {
    console.error('[Reviews] Write error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

/**
 * POST /api/reviews/refresh — Admin: trigger SerpAPI fetch immediately
 * Respects the weekly throttle unless ?force=1 is passed.
 */
router.post('/refresh', verifyToken, requireRole('admin'), async (req, res) => {
  const force = req.query.force === '1' || req.body?.force === true;
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  if (!force) {
    const existing = loadReviews();
    if (existing && existing.lastUpdated) {
      const elapsed = Date.now() - new Date(existing.lastUpdated).getTime();
      if (elapsed < ONE_WEEK_MS) {
        const hoursLeft = Math.round((ONE_WEEK_MS - elapsed) / 3600000);
        return res.status(429).json({
          error: 'Rafraîchissement trop récent',
          message: `Dernier fetch il y a ${Math.round(elapsed / 3600000)}h. Prochain possible dans ${hoursLeft}h (quota SerpAPI). Utilise ?force=1 pour forcer.`,
          lastUpdated: existing.lastUpdated,
        });
      }
    }
  }

  try {
    const { fetchReviews } = require('../scripts/fetch-reviews-serpapi');
    const data = await fetchReviews({ silent: true });
    res.json({
      success: true,
      count: data.reviews.length,
      raw: data.rawFetched,
      pages: data.pagesFetched,
      rating: data.rating,
      totalRatings: data.totalRatings,
      distribution: data.ratingDistributionSample,
      lastUpdated: data.lastUpdated,
    });
  } catch (err) {
    console.error('[Reviews] Refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
