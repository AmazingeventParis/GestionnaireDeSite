/**
 * GET /api/reviews — Avis Google Places
 * Cache mémoire 24h. Supporte plusieurs Place IDs (Paris + Bordeaux).
 *
 * Variables .env requises :
 *   GOOGLE_MAPS_API_KEY  — clé API Google Maps Platform (Places API activée)
 *   GOOGLE_PLACE_IDS     — IDs séparés par virgule. Formats acceptés :
 *                            ChIJ...         → Place ID standard
 *                            cid:1234567890  → CID décimal (fallback avant d'avoir le ChIJ)
 *                          Exemple mixte : ChIJxSIRRC5x5kcRX2Elmh-CeRI,cid:4995458683613515245
 *                          (ou GOOGLE_PLACE_ID pour un seul)
 *
 * Trouver un Place ID :
 *   node scripts/find-place-ids.js  (une fois GOOGLE_MAPS_API_KEY configuré)
 *   Ou : https://developers.google.com/maps/documentation/places/web-service/place-id
 *
 * CIDs connus Shootnbox (pré-découverts) :
 *   Paris    cid:5180952864860742341
 *   Bordeaux cid:4995458683613515245
 */

const express = require('express');
const router = express.Router();

// Cache mémoire 24h
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getPlaceIds() {
  const raw = process.env.GOOGLE_PLACE_IDS || process.env.GOOGLE_PLACE_ID || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

async function fetchPlace(placeId, apiKey) {
  const fields = 'name,rating,user_ratings_total,reviews,url';
  const url = `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${fields}` +
    `&language=fr` +
    `&reviews_sort=newest` +
    `&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Places API: ${data.status} — ${data.error_message || ''}`);
  return data.result;
}

/**
 * GET /api/reviews
 * Réponse : { rating, totalRatings, reviews[], googleUrl }
 */
router.get('/', async (req, res) => {
  // Cache frais
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) {
    return res.json(_cache);
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY non configuré dans .env' });
  }

  const placeIds = getPlaceIds();
  if (!placeIds.length) {
    return res.status(503).json({ error: 'GOOGLE_PLACE_IDS non configuré dans .env' });
  }

  try {
    const places = await Promise.all(placeIds.map(id => fetchPlace(id, apiKey)));

    // Agréger rating global (moyenne pondérée)
    let weightedSum = 0;
    let totalCount = 0;
    const allReviews = [];

    for (const place of places) {
      const count = place.user_ratings_total || 0;
      const rating = place.rating || 0;
      weightedSum += rating * count;
      totalCount += count;

      for (const r of (place.reviews || [])) {
        allReviews.push({
          author: r.author_name || 'Anonyme',
          avatar: r.profile_photo_url || null,
          rating: r.rating || 5,
          text: r.text || '',
          time: r.relative_time_description || '',
          timestamp: r.time || 0,   // Unix timestamp pour tri chronologique
          locationName: place.name || ''
        });
      }
    }

    // Sélection qualitative :
    //   - 5★ : commentaire ≥ 60 caractères (vrai retour d'expérience)
    //   - 4★ : commentaire ≥ 120 caractères, max 2 retenus
    // Tri final : les plus récents en premier
    const fiveStars = allReviews
      .filter(r => r.rating === 5 && r.text.trim().length >= 60)
      .sort((a, b) => b.timestamp - a.timestamp);

    const fourStars = allReviews
      .filter(r => r.rating === 4 && r.text.trim().length >= 120)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 2);

    const reviews = [...fiveStars, ...fourStars]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map(({ timestamp, ...r }) => r);   // ne pas exposer le timestamp brut

    const globalRating = totalCount > 0
      ? Math.round((weightedSum / totalCount) * 10) / 10
      : 0;

    _cache = {
      rating: globalRating,
      totalRatings: totalCount,
      reviews,
      googleUrl: places[0]?.url || null
    };
    _cacheAt = Date.now();

    res.json(_cache);
  } catch (err) {
    console.error('[Reviews] Places API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reviews/clear-cache — Vider le cache manuellement (admin)
 */
router.post('/clear-cache', (req, res) => {
  _cache = null;
  _cacheAt = 0;
  res.json({ success: true, message: 'Cache avis vidé' });
});

module.exports = router;
