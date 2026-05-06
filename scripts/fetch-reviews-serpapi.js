// scripts/fetch-reviews-serpapi.js
// Fetch Google Maps reviews via SerpAPI, filter, sort, save to reviews.json
// Run via: node scripts/fetch-reviews-serpapi.js
// Requires env var: SERPAPI_KEY
// Free plan: 250 searches/month — script capped at 15 pages per run.

const fs = require('fs');
const path = require('path');

const SERPAPI_KEY = process.env.SERPAPI_KEY;

// Shootnbox defaults (legacy)
const DEFAULT_DATA_ID  = process.env.SERPAPI_DATA_ID  || '0x47e6712e441122c5:0x1279821f9a25615f';
const DEFAULT_PLACE_ID = process.env.SERPAPI_PLACE_ID || 'ChIJxSIRRC5x5kcRX2Elmh-CeRI';
const DEFAULT_OUTPUT   = path.join(__dirname, '..', 'previews', '_shared', 'reviews.json');

const MAX_PAGES      = 15;
const MAX_REVIEWS    = 50;
const MIN_RATING     = 4;
const MIN_TEXT_LENGTH = 40;

async function fetchPage({ dataId, placeId, nextPageToken }) {
  const params = new URLSearchParams({
    engine: 'google_maps_reviews',
    api_key: SERPAPI_KEY,
    sort_by: 'newestFirst',
    hl: 'fr',
  });

  // data_id takes precedence; fall back to place_id (ChIJ... format)
  if (dataId) {
    params.set('data_id', dataId);
  } else {
    params.set('place_id', placeId);
  }

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

async function fetchAllReviews({ dataId, placeId }) {
  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY env var missing');

  let allRaw = [];
  let placeInfo = null;
  let nextToken = null;
  let page = 0;

  do {
    const data = await fetchPage({ dataId, placeId, nextPageToken: nextToken });
    if (!placeInfo && data.place_info) placeInfo = data.place_info;
    const reviews = data.reviews || [];
    allRaw = allRaw.concat(reviews);
    page++;

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

async function fetchReviews({
  silent = false,
  dataId = DEFAULT_DATA_ID,
  placeId = DEFAULT_PLACE_ID,
  outputPath = DEFAULT_OUTPUT,
} = {}) {
  const { allRaw, placeInfo, pagesFetched } = await fetchAllReviews({ dataId, placeId });

  const filtered = allRaw.filter((r) => {
    const rating = r.rating || 0;
    const text = (r.snippet || r.extracted_snippet || '').trim();
    return rating >= MIN_RATING && text.length > MIN_TEXT_LENGTH;
  });

  filtered.sort((a, b) => {
    const da = a.iso_date ? new Date(a.iso_date).getTime() : 0;
    const db = b.iso_date ? new Date(b.iso_date).getTime() : 0;
    return db - da;
  });

  const top = filtered.slice(0, MAX_REVIEWS).map(mapToStoredReview);
  const ratingDistributionSample = computeDistribution(allRaw);

  let existing = {};
  if (fs.existsSync(outputPath)) {
    try { existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8')); } catch {}
  }

  const data = {
    rating: placeInfo?.rating ?? existing.rating ?? 5.0,
    totalRatings: placeInfo?.reviews ?? existing.totalRatings ?? 0,
    googleUrl: existing.googleUrl || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    placeId,
    dataId: dataId || null,
    writeReviewUrl: existing.writeReviewUrl || `https://search.google.com/local/writereview?placeid=${placeId}`,
    ratingDistributionSample,
    reviews: top,
    lastUpdated: new Date().toISOString(),
    source: 'serpapi',
    pagesFetched,
    rawFetched: allRaw.length,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');

  if (!silent) {
    console.log(`[reviews-serpapi] pages=${pagesFetched} raw=${allRaw.length} filtered=${filtered.length} kept=${top.length}`);
    console.log(`[reviews-serpapi] rating=${data.rating} total=${data.totalRatings}`);
    console.log(`[reviews-serpapi] written to ${outputPath}`);
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
