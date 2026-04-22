// scripts/fetch-reviews-serpapi.js
// Fetch Google Maps reviews via SerpAPI, filter, sort, save to previews/_shared/reviews.json
// Run via: node scripts/fetch-reviews-serpapi.js
// Requires env var: SERPAPI_KEY
// Free plan: 250 searches/month — script capped at 15 pages per run.

const fs = require('fs');
const path = require('path');

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const DATA_ID = process.env.SERPAPI_DATA_ID || '0x47e6712e441122c5:0x1279821f9a25615f';
const PLACE_ID = process.env.SERPAPI_PLACE_ID || 'ChIJxSIRRC5x5kcRX2Elmh-CeRI';
const OUTPUT_PATH = path.join(__dirname, '..', 'previews', '_shared', 'reviews.json');

const MAX_PAGES = 15;           // safety cap vs. 250/month budget
const MAX_REVIEWS = 50;         // final count target
const MIN_RATING = 4;           // keep only 4★ and 5★
const MIN_TEXT_LENGTH = 40;     // keep only reviews with meaningful text

async function fetchPage(nextPageToken) {
  const params = new URLSearchParams({
    engine: 'google_maps_reviews',
    data_id: DATA_ID,
    api_key: SERPAPI_KEY,
    sort_by: 'newestFirst',
    hl: 'fr',
  });
  if (nextPageToken) params.set('next_page_token', nextPageToken);

  const url = `https://serpapi.com/search.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`SerpAPI: ${data.error}`);
  return data;
}

function computeDistribution(rawReviews) {
  const dist = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
  for (const r of rawReviews) {
    const k = String(r.rating);
    if (dist[k] !== undefined) dist[k]++;
  }
  return dist;
}

async function fetchAllReviews() {
  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY env var missing');

  let allRaw = [];
  let placeInfo = null;
  let nextToken = null;
  let page = 0;

  do {
    const data = await fetchPage(nextToken);
    if (!placeInfo && data.place_info) placeInfo = data.place_info;
    const reviews = data.reviews || [];
    allRaw = allRaw.concat(reviews);
    page++;

    // Stop if we already have enough reviews that pass the filter
    const passing = allRaw.filter(
      (r) => (r.rating || 0) >= MIN_RATING && ((r.snippet || r.extracted_snippet || '').trim().length > MIN_TEXT_LENGTH)
    ).length;
    if (passing >= MAX_REVIEWS) break;

    nextToken = data.serpapi_pagination?.next_page_token || null;
    if (!nextToken) break;
  } while (page < MAX_PAGES);

  return { allRaw, placeInfo, pagesFetched: page };
}

function mapToStoredReview(r) {
  const text = (r.snippet || r.extracted_snippet || '').trim();
  return {
    author: r.user?.name || '',
    avatar: r.user?.thumbnail || null,
    rating: r.rating || 5,
    time: r.date || '',
    iso_date: r.iso_date || null,
    text,
  };
}

async function fetchReviews({ silent = false } = {}) {
  const { allRaw, placeInfo, pagesFetched } = await fetchAllReviews();

  // Filter: rating ≥ 4 AND text > 40 chars
  const filtered = allRaw.filter((r) => {
    const rating = r.rating || 0;
    const text = (r.snippet || r.extracted_snippet || '').trim();
    return rating >= MIN_RATING && text.length > MIN_TEXT_LENGTH;
  });

  // Sort: most recent first (iso_date fallback to 0)
  filtered.sort((a, b) => {
    const da = a.iso_date ? new Date(a.iso_date).getTime() : 0;
    const db = b.iso_date ? new Date(b.iso_date).getTime() : 0;
    return db - da;
  });

  const top = filtered.slice(0, MAX_REVIEWS).map(mapToStoredReview);

  // Rating distribution (from raw scraped sample; not the global Google distribution)
  const ratingDistributionSample = computeDistribution(allRaw);

  // Load existing to preserve URLs
  let existing = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')); } catch {}
  }

  const data = {
    rating: placeInfo?.rating ?? existing.rating ?? 4.8,
    totalRatings: placeInfo?.reviews ?? existing.totalRatings ?? 1192,
    googleUrl: existing.googleUrl || `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`,
    placeId: PLACE_ID,
    dataId: DATA_ID,
    writeReviewUrl: existing.writeReviewUrl || `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
    ratingDistributionSample,
    reviews: top,
    lastUpdated: new Date().toISOString(),
    source: 'serpapi',
    pagesFetched,
    rawFetched: allRaw.length,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');

  if (!silent) {
    console.log(`[reviews-serpapi] pages=${pagesFetched} raw=${allRaw.length} filtered=${filtered.length} kept=${top.length}`);
    console.log(`[reviews-serpapi] rating=${data.rating} total=${data.totalRatings}`);
    console.log(`[reviews-serpapi] written to ${OUTPUT_PATH}`);
  }

  return data;
}

if (require.main === module) {
  fetchReviews().catch((err) => {
    console.error('[reviews-serpapi] ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = { fetchReviews };
