/**
 * find-place-ids.js — Trouver les Place IDs Google pour Shootnbox
 *
 * Usage :
 *   GOOGLE_MAPS_API_KEY=AIza... node scripts/find-place-ids.js
 *
 * Ce script cherche les Place IDs (format ChIJ...) pour les établissements
 * Shootnbox Paris et Bordeaux, puis affiche la ligne à copier dans .env
 *
 * Pré-requis :
 *   - Places API activée sur le projet GCP (project 362425146347)
 *   - Clé API sans restriction (ou avec IP/referer autorisant ce script)
 */

require('dotenv').config();

const https = require('https');

const PLACES_TO_FIND = [
  {
    label: 'Shootnbox Paris',
    query: 'Shootnbox photobooth Paris',
    // CID de secours (trouvé en inspectant Google Maps)
    cid: '5180952864860742341'
  },
  {
    label: 'Shootnbox Bordeaux',
    query: 'Shootnbox photobooth Bordeaux',
    cid: '4995458683613515245'
  }
];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

async function findPlaceId(apiKey, entry) {
  // Méthode 1 : Find Place from Text
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(entry.query)}` +
    `&inputtype=textquery` +
    `&fields=place_id,name,formatted_address` +
    `&locationbias=circle:50000@48.8566,2.3522` +  // biais Paris
    `&key=${apiKey}`;

  try {
    const data = await httpsGet(url);
    if (data.status === 'OK' && data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      console.log(`  ✓ ${entry.label}: ${candidate.place_id}`);
      console.log(`    → ${candidate.name} — ${candidate.formatted_address}`);
      return candidate.place_id;
    }
    console.warn(`  ⚠ ${entry.label}: status=${data.status} (${data.error_message || 'no candidates'})`);
  } catch (err) {
    console.warn(`  ✗ ${entry.label} (findplacefromtext): ${err.message}`);
  }

  // Méthode 2 : Chercher par CID (Place Details avec cid:)
  if (entry.cid) {
    console.log(`  → Fallback CID pour ${entry.label}: cid:${entry.cid}`);
    const cidUrl = `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=cid:${entry.cid}` +
      `&fields=place_id,name,formatted_address` +
      `&key=${apiKey}`;

    try {
      const data = await httpsGet(cidUrl);
      if (data.status === 'OK' && data.result) {
        console.log(`  ✓ ${entry.label} (via CID): ${data.result.place_id}`);
        console.log(`    → ${data.result.name} — ${data.result.formatted_address}`);
        return data.result.place_id;
      }
      console.warn(`  ⚠ ${entry.label} (CID): status=${data.status} — ${data.error_message || ''}`);
    } catch (err) {
      console.warn(`  ✗ ${entry.label} (CID): ${err.message}`);
    }
  }

  return null;
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('FATAL: GOOGLE_MAPS_API_KEY non défini');
    console.error('Usage: GOOGLE_MAPS_API_KEY=AIza... node scripts/find-place-ids.js');
    process.exit(1);
  }

  console.log('=== Recherche des Place IDs Google ===\n');

  const placeIds = [];
  for (const entry of PLACES_TO_FIND) {
    console.log(`Recherche: ${entry.label}`);
    const id = await findPlaceId(apiKey, entry);
    if (id) placeIds.push(id);
    console.log('');
  }

  if (placeIds.length === 0) {
    console.error('Aucun Place ID trouvé. Vérifiez que Places API est activée.');
    process.exit(1);
  }

  console.log('=== Résultat — copiez dans votre .env ===\n');
  console.log(`GOOGLE_PLACE_IDS=${placeIds.join(',')}`);
  console.log('\n=== Vérification des avis (optionnel) ===');
  console.log('Testez avec :');
  console.log('  curl http://localhost:3000/api/reviews | node -e "const d=require(\'fs\').readFileSync(\'/dev/stdin\',\'utf8\');const j=JSON.parse(d);console.log(\'Rating:\',j.rating,\'(\'+j.totalRatings+\' avis)\',\'|\',j.reviews.length,\'avis affichés\')"');
}

main().catch(err => {
  console.error('Erreur inattendue:', err);
  process.exit(1);
});
