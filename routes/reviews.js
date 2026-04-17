const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Reviews stored in previews/_shared/reviews.json (gds-previews Docker volume — persists across deploys)
const REVIEWS_PATH = path.join(__dirname, '..', 'previews', '_shared', 'reviews.json');

function loadReviews() {
  if (!fs.existsSync(REVIEWS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf-8'));
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
    fs.writeFileSync(REVIEWS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, count: data.reviews.length });
  } catch (err) {
    console.error('[Reviews] Write error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

module.exports = router;
