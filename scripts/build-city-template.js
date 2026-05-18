#!/usr/bin/env node
/**
 * Build city pages from Alfortville template.
 * Usage: node scripts/build-city-template.js <slug> [<slug> ...]
 *        node scripts/build-city-template.js --all
 *        node scripts/build-city-template.js --test  (Antony, Saint-Denis, Versailles)
 *
 * For each city:
 *   1. Compute 5 nearest neighbors (by GPS distance) from the IDF dataset that have published GDS pages
 *   2. Delete all existing sections of the city page
 *   3. PUT 9 templated sections (10-90) with city-specific data
 *   4. POST /save with SEO meta + Service+Place+FAQPage JSON-LD
 *   5. POST deploy
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'sites.swipego.app';
const TOKEN_FILE = path.join(process.cwd(), '.tmp-token.txt');

if (!fs.existsSync(TOKEN_FILE)) {
  console.error('Missing .tmp-token.txt — login first');
  process.exit(1);
}
const TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();

// ============ CITIES DATASET (122 IDF cities) ============
// Format: slug -> { ville, cp, dept, deptCode, lat, lng, quartiers? }
const CITIES = {
  // Val-de-Marne (94)
  'alfortville': { ville: "Alfortville", cp: "94140", dept: "Val-de-Marne", deptCode: "94", lat: 48.8081, lng: 2.4197, quartiers: ["Centre-ville","Bords-de-Seine","Chantereine","Grand Ensemble","Liberté","Vert-de-Maisons"] },
  'arcueil': { ville: "Arcueil", cp: "94110", dept: "Val-de-Marne", deptCode: "94", lat: 48.8056, lng: 2.3344 },
  'bonneuil-sur-marne': { ville: "Bonneuil-sur-Marne", cp: "94380", dept: "Val-de-Marne", deptCode: "94", lat: 48.7752, lng: 2.4827 },
  'bry-sur-marne': { ville: "Bry-sur-Marne", cp: "94360", dept: "Val-de-Marne", deptCode: "94", lat: 48.8395, lng: 2.5197 },
  'cachan': { ville: "Cachan", cp: "94230", dept: "Val-de-Marne", deptCode: "94", lat: 48.7900, lng: 2.3306 },
  'champigny-sur-marne': { ville: "Champigny-sur-Marne", cp: "94500", dept: "Val-de-Marne", deptCode: "94", lat: 48.8167, lng: 2.5167 },
  'charenton-le-pont': { ville: "Charenton-le-Pont", cp: "94220", dept: "Val-de-Marne", deptCode: "94", lat: 48.8217, lng: 2.4128 },
  'chennevieres-sur-marne': { ville: "Chennevières-sur-Marne", cp: "94430", dept: "Val-de-Marne", deptCode: "94", lat: 48.7956, lng: 2.5358 },
  'chevilly-larue': { ville: "Chevilly-Larue", cp: "94550", dept: "Val-de-Marne", deptCode: "94", lat: 48.7670, lng: 2.3536 },
  'choisy-le-roi': { ville: "Choisy-le-Roi", cp: "94600", dept: "Val-de-Marne", deptCode: "94", lat: 48.7644, lng: 2.4115 },
  'creteil': { ville: "Créteil", cp: "94000", dept: "Val-de-Marne", deptCode: "94", lat: 48.7903, lng: 2.4553 },
  'fontenay-sous-bois': { ville: "Fontenay-sous-Bois", cp: "94120", dept: "Val-de-Marne", deptCode: "94", lat: 48.8500, lng: 2.4717 },
  'fresnes': { ville: "Fresnes", cp: "94260", dept: "Val-de-Marne", deptCode: "94", lat: 48.7561, lng: 2.3217 },
  'gentilly': { ville: "Gentilly", cp: "94250", dept: "Val-de-Marne", deptCode: "94", lat: 48.8147, lng: 2.3450 },
  'ivry-sur-seine': { ville: "Ivry-sur-Seine", cp: "94200", dept: "Val-de-Marne", deptCode: "94", lat: 48.8133, lng: 2.3833 },
  'joinville-le-pont': { ville: "Joinville-le-Pont", cp: "94340", dept: "Val-de-Marne", deptCode: "94", lat: 48.8217, lng: 2.4711 },
  'kremlin-bicetre': { ville: "Le Kremlin-Bicêtre", cp: "94270", dept: "Val-de-Marne", deptCode: "94", lat: 48.8108, lng: 2.3556 },
  'le-perreux-sur-marne': { ville: "Le Perreux-sur-Marne", cp: "94170", dept: "Val-de-Marne", deptCode: "94", lat: 48.8403, lng: 2.5044 },
  'le-plessis-trevise': { ville: "Le Plessis-Trévise", cp: "94420", dept: "Val-de-Marne", deptCode: "94", lat: 48.8094, lng: 2.5694 },
  'l-hay-les-roses': { ville: "L'Haÿ-les-Roses", cp: "94240", dept: "Val-de-Marne", deptCode: "94", lat: 48.7806, lng: 2.3367 },
  'maison-alfort': { ville: "Maisons-Alfort", cp: "94700", dept: "Val-de-Marne", deptCode: "94", lat: 48.8049, lng: 2.4366 },
  'nogent-sur-marne': { ville: "Nogent-sur-Marne", cp: "94130", dept: "Val-de-Marne", deptCode: "94", lat: 48.8378, lng: 2.4831 },
  'orly': { ville: "Orly", cp: "94310", dept: "Val-de-Marne", deptCode: "94", lat: 48.7414, lng: 2.3878 },
  'rungis': { ville: "Rungis", cp: "94150", dept: "Val-de-Marne", deptCode: "94", lat: 48.7497, lng: 2.3506 },
  'saint-mande': { ville: "Saint-Mandé", cp: "94160", dept: "Val-de-Marne", deptCode: "94", lat: 48.8378, lng: 2.4181 },
  'saint-maur-des-fosses': { ville: "Saint-Maur-des-Fossés", cp: "94100", dept: "Val-de-Marne", deptCode: "94", lat: 48.7967, lng: 2.4828 },
  'sucy-en-brie': { ville: "Sucy-en-Brie", cp: "94370", dept: "Val-de-Marne", deptCode: "94", lat: 48.7681, lng: 2.5181 },
  'thiais': { ville: "Thiais", cp: "94320", dept: "Val-de-Marne", deptCode: "94", lat: 48.7642, lng: 2.3936 },
  'villejuif': { ville: "Villejuif", cp: "94800", dept: "Val-de-Marne", deptCode: "94", lat: 48.7906, lng: 2.3597 },
  'villiers-sur-marne': { ville: "Villiers-sur-Marne", cp: "94350", dept: "Val-de-Marne", deptCode: "94", lat: 48.8278, lng: 2.5478 },
  'vincennes': { ville: "Vincennes", cp: "94300", dept: "Val-de-Marne", deptCode: "94", lat: 48.8475, lng: 2.4378 },
  'vitry-sur-seine': { ville: "Vitry-sur-Seine", cp: "94400", dept: "Val-de-Marne", deptCode: "94", lat: 48.7872, lng: 2.4019 },

  // Hauts-de-Seine (92)
  'antony': { ville: "Antony", cp: "92160", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7544, lng: 2.2972 },
  'asnieres': { ville: "Asnières-sur-Seine", cp: "92600", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.9133, lng: 2.2856 },
  'bagneux': { ville: "Bagneux", cp: "92220", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7967, lng: 2.3081 },
  'boulogne': { ville: "Boulogne-Billancourt", cp: "92100", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8333, lng: 2.2500 },
  'bourg-la-reine': { ville: "Bourg-la-Reine", cp: "92340", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7800, lng: 2.3147 },
  'chatenay-malabry': { ville: "Châtenay-Malabry", cp: "92290", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7647, lng: 2.2697 },
  'chatillon': { ville: "Châtillon", cp: "92320", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8014, lng: 2.2906 },
  'chaville': { ville: "Chaville", cp: "92370", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8061, lng: 2.1903 },
  'clamart': { ville: "Clamart", cp: "92140", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8014, lng: 2.2606 },
  'clichy': { ville: "Clichy", cp: "92110", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.9036, lng: 2.3061 },
  'colombes': { ville: "Colombes", cp: "92700", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.9233, lng: 2.2547 },
  'courbevoie': { ville: "Courbevoie", cp: "92400", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8967, lng: 2.2553 },
  'fontenay-aux-roses': { ville: "Fontenay-aux-Roses", cp: "92260", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7889, lng: 2.2906 },
  'garches': { ville: "Garches", cp: "92380", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8467, lng: 2.1875 },
  'gennevilliers': { ville: "Gennevilliers", cp: "92230", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.9333, lng: 2.2944 },
  'issy-les-moulineaux': { ville: "Issy-les-Moulineaux", cp: "92130", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8228, lng: 2.2728 },
  'la-garenne-colombes': { ville: "La Garenne-Colombes", cp: "92250", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.9067, lng: 2.2444 },
  'le-plessis-robinson': { ville: "Le Plessis-Robinson", cp: "92350", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7811, lng: 2.2647 },
  'levallois-perret': { ville: "Levallois-Perret", cp: "92300", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8950, lng: 2.2864 },
  'malakoff': { ville: "Malakoff", cp: "92240", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8228, lng: 2.2978 },
  'meudon': { ville: "Meudon", cp: "92190", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8133, lng: 2.2356 },
  'montrouge': { ville: "Montrouge", cp: "92120", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8186, lng: 2.3197 },
  'nanterre': { ville: "Nanterre", cp: "92000", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8917, lng: 2.2069 },
  'neuilly-sur-seine': { ville: "Neuilly-sur-Seine", cp: "92200", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8847, lng: 2.2683 },
  'puteaux': { ville: "Puteaux", cp: "92800", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8847, lng: 2.2389 },
  'rueil-malmaison': { ville: "Rueil-Malmaison", cp: "92500", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8767, lng: 2.1808 },
  'saint-cloud': { ville: "Saint-Cloud", cp: "92210", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8400, lng: 2.2189 },
  'sceaux': { ville: "Sceaux", cp: "92330", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.7794, lng: 2.2900 },
  'sevres': { ville: "Sèvres", cp: "92310", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8231, lng: 2.2153 },
  'suresnes': { ville: "Suresnes", cp: "92150", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8694, lng: 2.2275 },
  'vanves': { ville: "Vanves", cp: "92170", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.8211, lng: 2.2906 },
  'villeneuve-la-garenne': { ville: "Villeneuve-la-Garenne", cp: "92390", dept: "Hauts-de-Seine", deptCode: "92", lat: 48.9389, lng: 2.3253 },

  // Seine-Saint-Denis (93)
  'aubervilliers': { ville: "Aubervilliers", cp: "93300", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9136, lng: 2.3833 },
  'aulnay-sous-bois': { ville: "Aulnay-sous-Bois", cp: "93600", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9381, lng: 2.4944 },
  'bagnolet': { ville: "Bagnolet", cp: "93170", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8689, lng: 2.4172 },
  'bobigny': { ville: "Bobigny", cp: "93000", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9106, lng: 2.4397 },
  'bondy': { ville: "Bondy", cp: "93140", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9028, lng: 2.4778 },
  'clichy-sous-bois': { ville: "Clichy-sous-Bois", cp: "93390", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9092, lng: 2.5547 },
  'drancy': { ville: "Drancy", cp: "93700", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9261, lng: 2.4467 },
  'epinay-sur-seine': { ville: "Épinay-sur-Seine", cp: "93800", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9542, lng: 2.3083 },
  'gagny': { ville: "Gagny", cp: "93220", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8856, lng: 2.5294 },
  'la-courneuve': { ville: "La Courneuve", cp: "93120", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9286, lng: 2.4006 },
  'le-blanc-mesnil': { ville: "Le Blanc-Mesnil", cp: "93150", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9389, lng: 2.4636 },
  'le-pre-saint-gervais': { ville: "Le Pré-Saint-Gervais", cp: "93310", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8836, lng: 2.4011 },
  'les-lilas': { ville: "Les Lilas", cp: "93260", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8814, lng: 2.4153 },
  'les-pavillons-sous-bois': { ville: "Les Pavillons-sous-Bois", cp: "93320", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9028, lng: 2.5042 },
  'livry-gargan': { ville: "Livry-Gargan", cp: "93190", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9181, lng: 2.5328 },
  'montfermeil': { ville: "Montfermeil", cp: "93370", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8975, lng: 2.5639 },
  'montreuil': { ville: "Montreuil", cp: "93100", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8631, lng: 2.4419 },
  'neuilly-plaisance': { ville: "Neuilly-Plaisance", cp: "93360", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8606, lng: 2.5078 },
  'neuilly-sur-marne': { ville: "Neuilly-sur-Marne", cp: "93330", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8528, lng: 2.5394 },
  'noisy-le-grand': { ville: "Noisy-le-Grand", cp: "93160", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8447, lng: 2.5667 },
  'noisy-le-sec': { ville: "Noisy-le-Sec", cp: "93130", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8908, lng: 2.4528 },
  'pantin': { ville: "Pantin", cp: "93500", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8956, lng: 2.4097 },
  'pierrefitte-sur-seine': { ville: "Pierrefitte-sur-Seine", cp: "93380", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9633, lng: 2.3625 },
  'romainville': { ville: "Romainville", cp: "93230", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8861, lng: 2.4358 },
  'rosny-sous-bois': { ville: "Rosny-sous-Bois", cp: "93110", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8722, lng: 2.4831 },
  'saint-denis': { ville: "Saint-Denis", cp: "93200", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9358, lng: 2.3539 },
  'saint-ouen': { ville: "Saint-Ouen-sur-Seine", cp: "93400", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9094, lng: 2.3306 },
  'sevran': { ville: "Sevran", cp: "93270", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9358, lng: 2.5286 },
  'stains': { ville: "Stains", cp: "93240", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9525, lng: 2.3897 },
  'tremblay-en-france': { ville: "Tremblay-en-France", cp: "93290", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9744, lng: 2.5697 },
  'villemomble': { ville: "Villemomble", cp: "93250", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.8836, lng: 2.5083 },
  'villepinte': { ville: "Villepinte", cp: "93420", dept: "Seine-Saint-Denis", deptCode: "93", lat: 48.9606, lng: 2.5417 },

  // Val-d'Oise (95)
  'argenteuil': { ville: "Argenteuil", cp: "95100", dept: "Val-d'Oise", deptCode: "95", lat: 48.9472, lng: 2.2469 },
  'bezons': { ville: "Bezons", cp: "95870", dept: "Val-d'Oise", deptCode: "95", lat: 48.9258, lng: 2.2169 },
  'cergy': { ville: "Cergy", cp: "95000", dept: "Val-d'Oise", deptCode: "95", lat: 49.0364, lng: 2.0786 },
  'deuil-la-barre': { ville: "Deuil-la-Barre", cp: "95170", dept: "Val-d'Oise", deptCode: "95", lat: 48.9744, lng: 2.3267 },
  'garges-les-gonesse': { ville: "Garges-lès-Gonesse", cp: "95140", dept: "Val-d'Oise", deptCode: "95", lat: 48.9722, lng: 2.4047 },
  'gonesse': { ville: "Gonesse", cp: "95500", dept: "Val-d'Oise", deptCode: "95", lat: 48.9889, lng: 2.4467 },
  'herblay': { ville: "Herblay-sur-Seine", cp: "95220", dept: "Val-d'Oise", deptCode: "95", lat: 48.9911, lng: 2.1644 },
  'sarcelles': { ville: "Sarcelles", cp: "95200", dept: "Val-d'Oise", deptCode: "95", lat: 48.9961, lng: 2.3781 },

  // Yvelines (78)
  'mantes-la-jolie': { ville: "Mantes-la-Jolie", cp: "78200", dept: "Yvelines", deptCode: "78", lat: 48.9911, lng: 1.7167 },
  'montigny-le-bretonneux': { ville: "Montigny-le-Bretonneux", cp: "78180", dept: "Yvelines", deptCode: "78", lat: 48.7700, lng: 2.0339 },
  'plaisir': { ville: "Plaisir", cp: "78370", dept: "Yvelines", deptCode: "78", lat: 48.8181, lng: 1.9461 },
  'poissy': { ville: "Poissy", cp: "78300", dept: "Yvelines", deptCode: "78", lat: 48.9292, lng: 2.0397 },
  'saint-germain-en-laye': { ville: "Saint-Germain-en-Laye", cp: "78100", dept: "Yvelines", deptCode: "78", lat: 48.8978, lng: 2.0936 },
  'sartrouville': { ville: "Sartrouville", cp: "78500", dept: "Yvelines", deptCode: "78", lat: 48.9367, lng: 2.1606 },
  'versailles': { ville: "Versailles", cp: "78000", dept: "Yvelines", deptCode: "78", lat: 48.8014, lng: 2.1301 },

  // Essonne (91)
  'athis-mons': { ville: "Athis-Mons", cp: "91200", dept: "Essonne", deptCode: "91", lat: 48.7064, lng: 2.4006 },
  'corbeil-essonne': { ville: "Corbeil-Essonnes", cp: "91100", dept: "Essonne", deptCode: "91", lat: 48.6058, lng: 2.4825 },
  'evry': { ville: "Évry-Courcouronnes", cp: "91000", dept: "Essonne", deptCode: "91", lat: 48.6275, lng: 2.4453 },
  'massy': { ville: "Massy", cp: "91300", dept: "Essonne", deptCode: "91", lat: 48.7300, lng: 2.2719 },
  'palaiseau': { ville: "Palaiseau", cp: "91120", dept: "Essonne", deptCode: "91", lat: 48.7142, lng: 2.2456 },

  // Seine-et-Marne (77)
  'champs-sur-marne': { ville: "Champs-sur-Marne", cp: "77420", dept: "Seine-et-Marne", deptCode: "77", lat: 48.8500, lng: 2.5994 },
  'chelles': { ville: "Chelles", cp: "77500", dept: "Seine-et-Marne", deptCode: "77", lat: 48.8825, lng: 2.5894 },
  'meaux': { ville: "Meaux", cp: "77100", dept: "Seine-et-Marne", deptCode: "77", lat: 48.9603, lng: 2.8786 },
  'melun': { ville: "Melun", cp: "77000", dept: "Seine-et-Marne", deptCode: "77", lat: 48.5392, lng: 2.6608 },
  'pontault-combault': { ville: "Pontault-Combault", cp: "77340", dept: "Seine-et-Marne", deptCode: "77", lat: 48.7944, lng: 2.6056 },
  'torcy': { ville: "Torcy", cp: "77200", dept: "Seine-et-Marne", deptCode: "77", lat: 48.8478, lng: 2.6450 }
};

const DEPOT = { ville: "Montreuil", cp: "93100", lat: 48.8631, lng: 2.4419 };

// ============ ADJACENCY ============
function haversineKm(a, b) {
  const R = 6371;
  const toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function getNeighbors(slug, n = 5) {
  const me = CITIES[slug];
  if (!me) return [];
  const others = Object.entries(CITIES)
    .filter(([s]) => s !== slug)
    .map(([s, c]) => ({ slug: s, ville: c.ville, dist: haversineKm(me, c) }))
    .sort((a, b) => a.dist - b.dist);
  // Prefer same dept, then any
  const sameDept = others.filter(o => CITIES[o.slug].deptCode === me.deptCode).slice(0, n);
  if (sameDept.length >= n) return sameDept;
  const others2 = others.filter(o => !sameDept.find(s => s.slug === o.slug)).slice(0, n - sameDept.length);
  return [...sameDept, ...others2];
}

function getDistanceTimeToDepot(slug) {
  const c = CITIES[slug];
  const km = Math.round(haversineKm(c, DEPOT));
  // Rough estimate: 2 min/km in urban IDF + 10 min base
  const minutes = Math.max(15, Math.min(90, 10 + km * 2));
  return { km, time: `${minutes} min` };
}

// ============ VARIANTS POOL ============
const TARIF_INTRO_POOL = [
  (c) => `Votre location de <strong>photobooth à ${c.ville}</strong> démarre à <strong>149€</strong>, livré et installé chez vous. Choisissez la borne adaptée parmi nos <span class="alf-kw">4 modèles professionnels</span> (Ring, Vegas, Miroir, Spinner) pour mariages, anniversaires ou soirées d'entreprise dans le ${c.dept}.`,
  (c) => `Pour vos événements à <strong>${c.ville} (${c.cp})</strong>, profitez d'un photobooth tout équipé à partir de <strong>149€</strong>, livré et installé sur place. Choisissez parmi nos <span class="alf-kw">4 bornes professionnelles</span> (Ring, Vegas, Miroir, Spinner) pour mariages, anniversaires ou soirées d'entreprise.`,
  (c) => `Photobooth professionnel à <strong>${c.ville}</strong> dès <strong>149€</strong> : nos équipes livrent et installent la borne sur place. Quatre modèles disponibles (Ring, Vegas, Miroir, Spinner) pour habiller mariages, anniversaires, baptêmes et soirées d'entreprise dans le ${c.dept} (${c.deptCode}).`,
  (c) => `À <strong>${c.ville}</strong>, louez votre photobooth dès <strong>149€</strong> avec livraison et installation comprises sur place. Quatre modèles au choix parmi nos <span class="alf-kw">bornes professionnelles</span> pour mariages, anniversaires et soirées d'entreprise.`
];
const HERO_SUB_POOL = [
  (c) => `Borne photo <strong>haute qualité</strong> livrée et installée à ${c.ville} et dans tout le ${c.dept} (${c.deptCode}). Idéale pour vos <strong>mariages, anniversaires et soirées d'entreprise</strong> : impressions photo instantanées illimitées, animation clé en main, sans contrainte logistique.`,
  (c) => `Photobooth <strong>professionnel</strong> livré directement à ${c.ville} (${c.cp}). Conçu pour vos <strong>mariages, anniversaires et événements d'entreprise</strong> : impressions illimitées, animation autonome, équipe technique joignable 7j/7.`,
  (c) => `Votre borne photo <strong>premium</strong> installée par nos équipes à ${c.ville} et dans le ${c.dept}. Animation tout-en-un pour <strong>mariages, anniversaires, EVJF et soirées d'entreprise</strong> : impressions, GIFs, partage instantané et galerie en ligne.`,
  (c) => `Animation photobooth <strong>clé en main</strong> à ${c.ville} et dans le ${c.dept} (${c.deptCode}). Équipement haut de gamme pour vos <strong>mariages, anniversaires, baptêmes et événements pro</strong> : impressions illimitées, contour personnalisé, partage sur smartphone.`
];
const LIVRAISON_INTRO_POOL = [
  (c, dist) => `Notre équipe se déplace à ${c.ville} (${c.cp}) depuis notre dépôt de Montreuil pour livrer votre photobooth, l'installer sur place et le récupérer après votre événement. Vous n'avez rien à transporter ni à brancher en amont.`,
  (c, dist) => `Depuis Montreuil, nos techniciens rejoignent ${c.ville} en ${dist.time} pour installer votre photobooth clé en main : livraison, montage, récupération. Service disponible 7 jours sur 7 dans tout le ${c.dept}.`,
  (c, dist) => `Service photobooth clé en main à ${c.ville} et dans tout le ${c.dept} : ${dist.km} km séparent notre dépôt de votre lieu d'événement. Nous livrons, installons et récupérons le matériel, vous n'avez rien à manipuler.`
];

function pickVariant(slug, pool) {
  // Deterministic pick based on slug hash → guarantees consistency across runs
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
}

// Pool d'ancres pour les CTAs internes vers /location-photobooth/ (diversification anchor text).
const ANCHOR_LP_POOL = [
  'Découvrir toutes les bornes',
  'Voir nos modèles de photobooth',
  'Comparer nos bornes photo',
  'Explorer notre catalogue location',
  'Tous nos photobooths professionnels',
  'Voir l\'ensemble de la gamme',
  'Découvrir notre catalogue photobooth',
  'Comparer les modèles disponibles'
];

// Picks two DIFFERENT anchors for the slug (for Ring + Vegas zoom CTAs).
function pickTwoAnchors(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  const h = Math.abs(hash);
  const i1 = h % ANCHOR_LP_POOL.length;
  const i2 = (h + 3) % ANCHOR_LP_POOL.length; // +3 to spread out
  return [ANCHOR_LP_POOL[i1], i1 === i2 ? ANCHOR_LP_POOL[(i2 + 1) % ANCHOR_LP_POOL.length] : ANCHOR_LP_POOL[i2]];
}

// ============ TEMPLATES ============
function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// French elision: "de Antony" → "d'Antony", "de Versailles" → "de Versailles"
function deVille(ville) {
  const first = ville.charAt(0).toLowerCase();
  if ('aeiouyhâàéèêëîïôöûüùœæ'.includes(first)) return `d'${ville}`;
  return `de ${ville}`;
}

function tplHero(c, dist) {
  const sub = pickVariant(c.slug, HERO_SUB_POOL)(c);
  return `<style>
.lp-hero{position:relative;overflow:hidden;background:#1a0a22;color:#fff;height:auto;max-height:none;display:flex;align-items:center}
.lp-hero-bg{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center center;z-index:0}
.lp-hero-bg-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to right,rgba(14,10,26,0.92) 0%,rgba(14,10,26,0.78) 25%,rgba(14,10,26,0.45) 50%,rgba(14,10,26,0.12) 70%,transparent 85%);z-index:0;display:block}
.lp-graffiti{position:absolute;border-radius:50%;z-index:1;pointer-events:none;opacity:0.15;filter:blur(2px)}
.lp-graf-1{width:280px;height:280px;background:radial-gradient(circle,#E51981 0%,transparent 70%);top:-40px;right:15%;opacity:0.2;filter:blur(30px)}
.lp-graf-2{width:200px;height:200px;background:radial-gradient(circle,#0250FF 0%,transparent 70%);top:10%;right:35%;opacity:0.18;filter:blur(25px)}
.lp-graf-3{width:320px;height:180px;background:radial-gradient(ellipse,#FF7A00 0%,transparent 70%);bottom:10%;right:20%;border-radius:60% 40% 50% 40%;opacity:0.15;filter:blur(20px)}
.lp-graf-4{width:150px;height:150px;background:radial-gradient(circle,#7828C8 0%,transparent 70%);top:20%;right:5%;opacity:0.2;filter:blur(20px)}
.lp-graf-5{width:100px;height:100px;background:radial-gradient(circle,#E51981 0%,transparent 70%);bottom:20%;right:8%;opacity:0.25;filter:blur(15px)}
.lp-spray{position:absolute;z-index:1;pointer-events:none}
.lp-spray::before,.lp-spray::after{content:'';position:absolute;border-radius:50%}
.lp-spray-1{top:8%;right:25%}
.lp-spray-1::before{width:6px;height:6px;background:#E51981;opacity:0.3}
.lp-spray-1::after{width:4px;height:4px;background:#ff3fac;opacity:0.25;top:15px;left:-20px}
.lp-spray-2{top:5%;right:40%}
.lp-spray-2::before{width:5px;height:5px;background:#0250FF;opacity:0.3}
.lp-spray-2::after{width:3px;height:3px;background:#4d8aff;opacity:0.2;top:-10px;left:15px}
.lp-spray-3{bottom:30%;right:12%}
.lp-spray-3::before{width:5px;height:5px;background:#FF7A00;opacity:0.35}
.lp-spray-3::after{width:4px;height:4px;background:#fbbf24;opacity:0.25;top:12px;left:-8px}
.lp-spray-4{top:15%;right:10%}
.lp-spray-4::before{width:4px;height:4px;background:#7828C8;opacity:0.3}
.lp-spray-4::after{width:6px;height:6px;background:#E51981;opacity:0.2;top:-18px;left:10px}
@media(max-width:768px){.lp-graffiti,.lp-spray{display:none}}
.lp-hero::after{content:'';position:absolute;bottom:0;left:0;width:100%;height:50%;background:linear-gradient(to top,rgba(229,25,129,0.08) 0%,transparent 100%);z-index:1}
.lp-hero-inner{position:relative;z-index:2;max-width:700px;margin:0 0 0 5%;padding:50px 40px 50px 0;text-align:left}
.lp-hero h1{font-family:'Raleway',sans-serif;font-size:50px;font-weight:900;font-style:italic;line-height:1.08;margin:0 0 12px;color:#fff}
.lp-hero .hero-wave{display:inline;animation:hero-color-wave 4s ease-in-out infinite}
@keyframes hero-color-wave{0%,100%{color:#fff}30%{color:#E51981}60%{color:#4d8aff}85%{color:#fff}}
.lp-hero-sub{font-size:17px;font-weight:400;line-height:1.6;color:rgba(255,255,255,0.75);margin:0 0 24px;max-width:620px}
.lp-hero-sub strong{color:#fff}
.lp-price-block{margin:0 0 24px;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.lp-price-from{font-size:18px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:3px}
.lp-price-amount{font-size:60px;font-weight:900;font-style:italic;color:#fff;line-height:1;text-shadow:0 0 40px rgba(229,25,129,0.4),0 0 80px rgba(229,25,129,0.15);min-height:68px}
.lp-price-period{font-size:14px;color:rgba(255,255,255,0.4);letter-spacing:1px}
.lp-price-line{width:60px;height:3px;background:linear-gradient(90deg,transparent,#E51981,transparent);margin:6px 0 0;border-radius:2px}
.lp-price-4x{margin-top:8px;font-size:15px;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:8px}
.lp-price-4x strong{color:#fff}
.lp-4x-icon{font-size:18px}
.lp-hero-proof{display:flex;align-items:center;justify-content:flex-start;gap:20px;margin-bottom:24px;flex-wrap:wrap}
.lp-proof-item{display:flex;align-items:center;gap:8px;font-size:14px;color:rgba(255,255,255,0.7)}
.lp-proof-item strong{color:#fff;font-size:16px}
.lp-proof-stars{color:#fbbf24;font-size:16px;letter-spacing:1px}
.lp-proof-sep{width:1px;height:20px;background:rgba(255,255,255,0.2)}
.lp-proof-g{width:22px;height:22px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#4285f4;flex-shrink:0}
.lp-hero-buttons{display:flex;gap:16px;justify-content:flex-start;flex-wrap:wrap}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;padding:15px 36px;border-radius:30px;font-weight:700;font-size:18px;font-family:'Raleway',sans-serif;cursor:pointer;border:none;position:relative;overflow:hidden;transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94);text-decoration:none}
.lp-btn::before{content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);transition:left 0.5s ease}
.lp-btn:hover::before{left:100%}
.lp-btn-primary{background:linear-gradient(135deg,#E51981,#ff3fac);color:#fff;box-shadow:0 4px 24px rgba(229,25,129,0.4)}
.lp-btn-primary:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 8px 32px rgba(229,25,129,0.55)}
@media(max-width:768px){
  .lp-hero{min-height:60vh}
  .lp-hero-bg{object-position:70% center}
  .lp-hero-bg-overlay{display:block;background:linear-gradient(to bottom,rgba(14,10,26,0.7) 0%,rgba(14,10,26,0.3) 40%,rgba(14,10,26,0.7) 100%)}
  .lp-hero{align-items:flex-start}
  .lp-hero-inner{padding:5vh 16px 40px;margin:0 auto!important;text-align:center!important;max-width:100%}
  .lp-hero h1{font-size:34px;text-align:center;margin-bottom:5px}
  .lp-hero-sub{display:none}
  .lp-hero-proof{display:none}
  .lp-price-block{align-items:center!important}
  .lp-price-amount{font-size:42px}
  .lp-price-from{font-size:14px}
  .lp-hero-buttons{justify-content:center;flex-direction:column;align-items:center;margin-bottom:15px}
  .lp-btn{padding:14px 32px;font-size:15px}
  .lp-price-period{display:none}
  .lp-price-block{margin-top:auto;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:12px 20px 12px!important;gap:0px!important;margin-bottom:10px}
  .lp-price-amount{font-size:54px!important}
  .lp-price-from{font-size:18px!important}
  .lp-hero-inner{display:flex;flex-direction:column;min-height:65vh;padding-bottom:10px!important}
  .lp-price-block{position:relative;padding-top:12px!important;padding-bottom:8px!important}
}
@media(max-width:480px){.lp-hero h1{font-size:32px}.lp-price-amount{font-size:36px}.lp-hero-inner{padding:5vh 12px 16px}}
</style>

<section class="lp-hero">
  <img class="lp-hero-bg" src="/site-images/valdemarne94-1775202601224.webp" alt="Vue panoramique de l'Île-de-France au coucher du soleil, secteur d'intervention Shootnbox pour la location de photobooth à ${escapeHtml(c.ville)} (${c.deptCode})" loading="eager" fetchpriority="high" width="1200" height="493" decoding="async">
  <div class="lp-hero-bg-overlay"></div>
  <div class="lp-graffiti lp-graf-1"></div><div class="lp-graffiti lp-graf-2"></div><div class="lp-graffiti lp-graf-3"></div><div class="lp-graffiti lp-graf-4"></div><div class="lp-graffiti lp-graf-5"></div>
  <div class="lp-spray lp-spray-1"></div><div class="lp-spray lp-spray-2"></div><div class="lp-spray lp-spray-3"></div><div class="lp-spray lp-spray-4"></div>
  <div class="lp-hero-inner">
    <h1>
      <span class="hero-wave" style="animation-delay:0s">Location de photobooth</span><br>
      <span class="hero-wave" style="animation-delay:0.4s">à ${escapeHtml(c.ville)},</span> <span class="hero-wave" style="animation-delay:0.8s">facile</span><br>
      <span class="hero-wave" style="animation-delay:1.2s">à installer</span> <span class="hero-wave" style="animation-delay:1.6s">en 5 minutes.</span>
    </h1>
    <p class="lp-hero-sub">${sub}</p>
    <div class="lp-price-block">
      <span class="lp-price-from">À PARTIR DE</span>
      <span class="lp-price-amount">149€</span>
      <span class="lp-price-period">par événement</span>
      <div class="lp-price-line"></div>
      <div class="lp-price-4x"><span class="lp-4x-icon">💳</span> Paiement en <strong>4x sans frais</strong></div>
    </div>
    <div class="lp-hero-proof">
      <div class="lp-proof-item"><span class="lp-proof-g">G</span><span class="lp-proof-stars">★★★★★</span><strong>4.8</strong>/5</div>
      <div class="lp-proof-sep"></div>
      <div class="lp-proof-item"><strong>+8 000</strong>&nbsp;événements</div>
      <div class="lp-proof-sep"></div>
      <div class="lp-proof-item"><strong>1 192</strong>&nbsp;avis Google</div>
    </div>
    <div class="lp-hero-buttons">
      <a href="https://shootnbox.fr/reservation/" class="lp-btn lp-btn-primary">Estimer mon tarif en 2 clics</a>
    </div>
  </div>
</section>`;
}

function tplLivraison(c, neighbors, dist) {
  const intro = pickVariant(c.slug, LIVRAISON_INTRO_POOL)(c, dist);
  const quartiers = (c.quartiers && c.quartiers.length) ? c.quartiers : ["Centre-ville","Quartiers résidentiels","Zones commerciales","Périphérie"];
  return `<style>
.alf-deliv{padding:50px 24px;max-width:1300px;margin:0 auto;font-family:'Raleway',sans-serif}
.alf-deliv-head{text-align:center;margin-bottom:28px}
.alf-deliv-eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#0250FF;margin-bottom:10px}
.alf-deliv-head h2{font-size:36px;font-weight:900;font-style:italic;line-height:1.15;margin:0 0 12px;color:#2d1b4e}
.alf-deliv-head h2 .alf-deliv-h-accent{background:linear-gradient(135deg,#0250FF,#4d8aff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.alf-deliv-head p{font-size:16px;line-height:1.65;color:#4a2d6e;max-width:760px;margin:0 auto}
.alf-deliv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:1100px;margin:28px auto}
.alf-deliv-card{background:linear-gradient(145deg,#eaeffa,#dce4f5);border:1.5px solid rgba(2,80,255,0.18);border-radius:16px;padding:20px 18px;text-align:center;box-shadow:inset 3px 3px 6px rgba(180,180,220,0.15),inset -2px -2px 5px rgba(255,255,255,0.7)}
.alf-deliv-card-num{font-size:32px;font-weight:900;font-style:italic;line-height:1;background:linear-gradient(135deg,#E51981,#0250FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px}
.alf-deliv-card-label{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#2d1b4e}
.alf-deliv-zones{max-width:1100px;margin:24px auto 0;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.alf-deliv-zone{background:rgba(255,255,255,0.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(229,25,129,0.12);border-radius:14px;padding:20px 22px}
.alf-deliv-zone h3{font-size:15px;font-weight:800;color:#2d1b4e;margin:0 0 12px;display:flex;align-items:center;gap:8px}
.alf-deliv-zone h3::before{content:'';width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#E51981,#a855f7);flex-shrink:0}
.alf-deliv-zone ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.alf-deliv-zone li{font-size:13px}
.alf-deliv-zone li span,.alf-deliv-zone li a{display:inline-block;color:#4a2d6e;background:rgba(229,25,129,0.07);padding:5px 12px;border-radius:50px;border:1px solid rgba(229,25,129,0.18);font-weight:600;text-decoration:none;transition:all .25s}
.alf-deliv-zone li a:hover{background:#E51981;border-color:#E51981;color:#fff}
@media(max-width:900px){.alf-deliv-grid{grid-template-columns:1fr 1fr;gap:12px}.alf-deliv-zones{grid-template-columns:1fr}.alf-deliv-head h2{font-size:28px}}
@media(max-width:520px){.alf-deliv{padding:36px 16px}.alf-deliv-card-num{font-size:26px}}
</style>

<section class="alf-deliv">
  <div class="alf-deliv-head">
    <span class="alf-deliv-eyebrow">Service clé en main · ${escapeHtml(c.dept)} (${c.deptCode})</span>
    <h2>Photobooth livré, installé et récupéré à <span class="alf-deliv-h-accent">${escapeHtml(c.ville)}</span></h2>
    <p>${intro}</p>
  </div>
  <div class="alf-deliv-grid">
    <div class="alf-deliv-card"><div class="alf-deliv-card-num">${dist.km} km</div><div class="alf-deliv-card-label">Depuis Montreuil</div></div>
    <div class="alf-deliv-card"><div class="alf-deliv-card-num">${dist.time}</div><div class="alf-deliv-card-label">Temps de trajet</div></div>
    <div class="alf-deliv-card"><div class="alf-deliv-card-num">Clé en main</div><div class="alf-deliv-card-label">Livraison · Installation · Récupération</div></div>
    <div class="alf-deliv-card"><div class="alf-deliv-card-num">7j/7</div><div class="alf-deliv-card-label">Week-ends et fériés</div></div>
  </div>
  <div class="alf-deliv-zones">
    <div class="alf-deliv-zone">
      <h3>Quartiers ${escapeHtml(deVille(c.ville))} desservis</h3>
      <ul>${quartiers.map(q => `<li><span>${escapeHtml(q)}</span></li>`).join('')}</ul>
    </div>
    <div class="alf-deliv-zone">
      <h3>Communes voisines couvertes</h3>
      <ul>${neighbors.map(n => `<li><a href="https://shootnbox.fr/location-photobooth-${n.slug}/">${escapeHtml(n.ville)}</a></li>`).join('')}</ul>
    </div>
  </div>
</section>`;
}

function tplTarifs(c) {
  const intro = pickVariant(c.slug, TARIF_INTRO_POOL)(c);
  const [anchorRing, anchorVegas] = pickTwoAnchors(c.slug);
  return `<style>
.alf-tarif{max-width:1300px;margin:0 auto;padding:60px 20px;font-family:'Raleway',system-ui,sans-serif}
.alf-tarif-head{text-align:center;margin-bottom:36px}
.alf-tarif-eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#a855f7;margin-bottom:10px}
.alf-tarif-head h2{font-size:42px;font-weight:900;font-style:italic;line-height:1.1;margin:0 0 14px;background:linear-gradient(135deg,#E51981,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.alf-tarif-head p{font-size:17px;line-height:1.65;color:#4a2d6e;max-width:780px;margin:0 auto}
.alf-tarif-head p strong{color:#2d1b4e;font-weight:700}
.alf-tarif-head .alf-kw{background:linear-gradient(135deg,rgba(229,25,129,0.1),rgba(168,85,247,0.08));padding:2px 7px;border-radius:6px;font-weight:600;color:#E51981}
.alf-bornes-grid{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin:0 auto;align-items:stretch;max-width:1300px}
.snb-b-card *,.snb-b-card *::before,.snb-b-card *::after{box-sizing:border-box}
.snb-b-card{position:relative;width:283px;min-width:283px;max-width:283px;display:flex;flex-direction:column;background:#1e1e2e;border-radius:18px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,0.06),0 20px 60px -15px rgba(0,0,0,0.3);transition:transform .3s ease,box-shadow .3s ease;font-family:'Raleway',sans-serif}
.snb-b-card:hover{transform:translateY(-8px) scale(1.05)}
.snb-b-card::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,transparent 40%,rgba(255,255,255,0.5) 50%,transparent 60%);transform:translateX(-150%) translateY(-150%);transition:none;z-index:20;pointer-events:none}
.snb-b-card:hover::before{transform:translateX(150%) translateY(150%);transition:transform .8s ease}
.snb-b-slide{position:relative;height:213px;overflow:hidden}
.snb-b-slide>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 30%;opacity:0;transition:opacity .8s ease}
.snb-b-slide>img.snb-active{opacity:1}
.snb-b-cat{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:rgba(0,0,0,0.6);color:#fff;padding:4px 10px;border-radius:12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2;white-space:nowrap}
.snb-b-badge{position:absolute;top:12px;right:12px;z-index:5;font-size:9px;font-weight:800;color:#fff;padding:5px 10px;border-radius:50px;letter-spacing:.5px;text-transform:uppercase;box-shadow:0 4px 12px rgba(0,0,0,0.3)}
.snb-b-content{padding:18px 16px 14px;display:flex;flex-direction:column;flex:1;gap:6px}
.snb-b-type{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a855f7;opacity:0.7}
.snb-b-name{font-size:22px;font-weight:900;font-style:italic;line-height:1.1}
.snb-b-price{display:flex;align-items:baseline;gap:6px;margin:2px 0 6px;flex-wrap:wrap}
.snb-b-amount{font-size:32px;font-weight:900;font-style:italic;line-height:1}
.snb-b-old{font-size:14px;color:rgba(255,255,255,0.4);text-decoration:line-through}
.snb-b-tag{font-size:9px;font-weight:800;color:#fff;padding:3px 8px;border-radius:50px;letter-spacing:.5px;text-transform:uppercase}
.snb-b-feats{display:flex;flex-direction:column;gap:5px;margin:8px 0 12px;flex:1}
.snb-b-feat{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;color:#f0e0f8}
.snb-b-feat-icon{font-size:14px;flex-shrink:0}
.snb-b-feat-text{font-size:11px;font-weight:600;color:rgba(232,212,240,0.9)}
.snb-b-cta{display:flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:50px;color:#fff;font-family:inherit;font-size:10px;font-weight:700;letter-spacing:.5px;cursor:pointer;text-align:center;text-decoration:none!important;position:relative;overflow:hidden;transition:all .3s ease;text-transform:uppercase}
.snb-b-cta:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(0,0,0,0.15)}
.alf-bornes-zoom{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:1100px;margin:64px auto 0}
.alf-borne-card{background:linear-gradient(145deg,#1a0a2e,#2d1548);border-radius:18px;padding:32px 28px;position:relative;overflow:hidden;color:#f0e0f8;box-shadow:0 8px 32px rgba(0,0,0,0.2);display:flex;flex-direction:column;gap:14px}
.alf-borne-card::before{content:'';position:absolute;inset:-2px;border-radius:20px;padding:2px;background:linear-gradient(135deg,var(--c1,#E51981),var(--c2,#ff3fac));-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0.55;pointer-events:none}
.alf-borne-card>*{position:relative;z-index:1}
.alf-borne-eyebrow{font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--c1,#E51981);opacity:0.95}
.alf-borne-card h3{font-size:26px;font-weight:900;font-style:italic;line-height:1.15;color:#fff;margin:0}
.alf-borne-tagline{font-size:14px;color:rgba(240,224,248,0.78);line-height:1.55;margin:0 0 4px}
.alf-borne-feats{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.alf-borne-feats li{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.4;color:#f0e0f8}
.alf-borne-feats li::before{content:'';flex-shrink:0;margin-top:6px;width:6px;height:6px;border-radius:50%;background:var(--c1,#E51981);box-shadow:0 0 8px rgba(229,25,129,0.5)}
.alf-borne-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:'Raleway',sans-serif;font-size:14px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--c1,#E51981),var(--c2,#ff3fac));padding:12px 26px;border-radius:50px;text-decoration:none;align-self:flex-start;margin-top:8px;box-shadow:0 6px 18px rgba(229,25,129,0.3);transition:all .3s ease}
.alf-borne-cta:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(229,25,129,0.45)}
.alf-borne-cta svg{width:14px;height:14px}
.alf-borne-link{font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);text-decoration:none;border-bottom:1px dotted rgba(255,255,255,0.3);padding:0 0 2px;align-self:flex-start;margin:0;transition:all .25s ease}
.alf-borne-link:hover{color:#fff;border-bottom-color:#fff}
.alf-borne-ring{--c1:#FF7A00;--c2:#ff9a3c}
.alf-borne-ring .alf-borne-feats li::before{background:#FF7A00;box-shadow:0 0 8px rgba(255,122,0,0.5)}
.alf-borne-ring .alf-borne-cta{background:linear-gradient(135deg,#FF7A00,#ff9a3c);box-shadow:0 6px 18px rgba(255,122,0,0.3)}
.alf-borne-ring .alf-borne-cta:hover{box-shadow:0 10px 28px rgba(255,122,0,0.45)}
.alf-borne-vegas{--c1:#E51981;--c2:#ff3fac}
@media(max-width:1000px){.snb-b-card{width:240px;min-width:240px;max-width:240px}}
@media(max-width:900px){.alf-tarif-head h2{font-size:32px}.alf-bornes-grid{display:grid;grid-template-columns:1fr 1fr;max-width:520px;gap:14px}.snb-b-card{width:100%;min-width:auto;max-width:none}.alf-bornes-zoom{grid-template-columns:1fr;gap:18px;margin-top:44px}.alf-borne-card{padding:26px 22px}.alf-borne-card h3{font-size:22px}}
@media(max-width:520px){.alf-tarif-head h2{font-size:26px}.alf-tarif-head p{font-size:15px}.alf-tarif{padding:40px 16px}.alf-bornes-grid{grid-template-columns:1fr;max-width:92vw}}
</style>

<section class="alf-tarif">
  <div class="alf-tarif-head">
    <span class="alf-tarif-eyebrow">Tarifs ${escapeHtml(c.ville)} · ${escapeHtml(c.dept)} (${c.deptCode})</span>
    <h2>Location de photobooth à ${escapeHtml(c.ville)} à partir de 149€</h2>
    <p>${intro}</p>
  </div>
  <div class="alf-bornes-grid" data-snb-bornes-alf></div>
  <div class="alf-bornes-zoom">
    <article class="alf-borne-card alf-borne-ring">
      <span class="alf-borne-eyebrow">Le Ring · sans impression</span>
      <h3>La borne photo nouvelle génération</h3>
      <p class="alf-borne-tagline">Idéale pour les jeunes et les événements connectés : tout passe par le smartphone, partage instantané sur les réseaux sociaux.</p>
      <ul class="alf-borne-feats">
        <li>Photos, GIFs et boomerangs illimités</li>
        <li>Partage instantané par SMS ou e-mail</li>
        <li>Galerie en ligne pour tous les invités</li>
        <li>Filtres et déguisements virtuels</li>
        <li>Installation 100% autonome</li>
      </ul>
      <a class="alf-borne-link" href="https://shootnbox.fr/le-ring/">Voir la fiche complète du Ring &rarr;</a>
      <a class="alf-borne-cta" href="https://shootnbox.fr/location-photobooth/">${escapeHtml(anchorRing)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a>
    </article>
    <article class="alf-borne-card alf-borne-vegas">
      <span class="alf-borne-eyebrow">Le Vegas · best-seller</span>
      <h3>Le photobooth le plus loué en France</h3>
      <p class="alf-borne-tagline">La référence des mariages et événements : 600 tirages photo haute qualité, contour personnalisable à votre charte et écran tactile XXL.</p>
      <ul class="alf-borne-feats">
        <li>600 impressions photo haute qualité</li>
        <li>Photos, GIFs et boomerangs illimités</li>
        <li>Contour photo personnalisé à votre événement</li>
        <li>Partage instantané et galerie en ligne</li>
        <li>Filtres couleurs et effets vintage</li>
      </ul>
      <a class="alf-borne-link" href="https://shootnbox.fr/vegas/">Voir la fiche complète du Vegas &rarr;</a>
      <a class="alf-borne-cta" href="https://shootnbox.fr/location-photobooth/">${escapeHtml(anchorVegas)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a>
    </article>
  </div>
</section>

<script>
(function(){
  var target=document.querySelector('[data-snb-bornes-alf]');
  if(!target) return;
  var API='https://shootnbox.fr/reservation/embed/options_api.php';
  var RESA='https://shootnbox.fr/reservation/';
  var ALLOWED=['ring','vegas','miroir','spinner'];
  var FEATURES={
    ring:[{i:'📸',t:'Photos GIFs Boomerangs'},{i:'📲',t:'Partage instantané'},{i:'🌐',t:'Galerie en ligne'},{i:'🎭',t:'Filtres & déguisements'},{i:'🖼️',t:'Contour personnalisé'},{i:'⚡',t:'Installation autonome'}],
    vegas:[{i:'🖨️',t:'600 impressions'},{i:'📸',t:'Photos GIFs Boomerangs'},{i:'📲',t:'Partage instantané'},{i:'🌐',t:'Galerie en ligne'},{i:'🖼️',t:'Contour personnalisé'},{i:'🎨',t:'Filtres de couleurs'}],
    miroir:[{i:'🖨️',t:'600 impressions'},{i:'📸',t:'Photos illimitées'},{i:'✨',t:'Animations tactiles'},{i:'📲',t:'Partage instantané'},{i:'🖼️',t:'Contour personnalisé'},{i:'👑',t:'Expérience premium'}],
    spinner:[{i:'🎥',t:'Vidéos illimitées'},{i:'👨‍🔧',t:'Technicien présent'},{i:'🎵',t:'Musique personnalisée'},{i:'📲',t:'Partage instantané'},{i:'🌐',t:'Galerie en ligne'},{i:'🐌',t:'Slow motion'}]
  };
  var BADGES={ring:'Sans impression',vegas:'Impression photo',miroir:'Impression photo',spinner:'Vidéobooth 360'};
  var BEST='vegas';
  var CITY=${JSON.stringify(c.ville)};
  function rgb(h){return parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16);}
  function card(b,promoText){
    var c=b.color||'#E51981',crgb=rgb(c);
    var prix=b.priceParticulier-(b.promoWe||b.promoWE||0);
    var hasPromo=(b.promoWe||b.promoWE||0)>0;
    var feats=(b.features&&b.features.length)?b.features:(FEATURES[b.id]||[]);
    var photos=b.photos||[];
    var badge=BADGES[b.id]||b.type||'';
    var best=b.id===BEST;
    var sDef=best?'0 0 0 2px '+c+',0 20px 60px -15px rgba(0,0,0,0.1),0 0 40px -10px rgba('+crgb+',0.15)':'0 0 0 1px rgba(255,255,255,0.06),0 20px 60px -15px rgba(0,0,0,0.3)';
    var sHov='0 0 0 2px '+c+',0 0 30px rgba('+crgb+',0.35),0 0 60px rgba('+crgb+',0.15)';
    var h='<div class="snb-b-card" style="box-shadow:'+sDef+'" onmouseenter="this.style.boxShadow=\\''+sHov+'\\'" onmouseleave="this.style.boxShadow=\\''+sDef+'\\'">';
    if(best) h+='<div class="snb-b-badge" style="background:linear-gradient(135deg,'+c+',rgba('+crgb+',0.7))">Best-seller</div>';
    h+='<div class="snb-b-slide" data-snb-slide><div class="snb-b-cat">'+badge+'</div>';
    photos.forEach(function(u,i){h+='<img src="'+u+'" alt="'+b.name+' à '+CITY+'" loading="lazy"'+(i===0?' class="snb-active"':'')+'>';});
    h+='</div>';
    h+='<div class="snb-b-content"><div class="snb-b-type">'+b.type+'</div>';
    var parts=b.name.split(' '),last=parts.pop();
    h+='<div class="snb-b-name"><span style="color:#fff">'+(parts.length?parts.join(' ')+' ':'')+'</span><span style="background:linear-gradient(135deg,'+c+',rgba('+crgb+',0.7));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">'+last+'</span></div>';
    h+='<div class="snb-b-price"><div class="snb-b-amount" style="background:linear-gradient(135deg,'+c+',rgba('+crgb+',0.7));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">'+prix+'&euro;</div>';
    if(hasPromo){h+='<div class="snb-b-old">'+b.priceParticulier+'&euro;</div><div class="snb-b-tag" style="background:'+c+'">'+(promoText||'Promo')+'</div>';}
    h+='</div><div class="snb-b-feats">';
    feats.forEach(function(f){h+='<div class="snb-b-feat" style="background:rgba('+crgb+',0.12);border:1px solid rgba('+crgb+',0.25)"><div class="snb-b-feat-icon">'+f.i+'</div><div class="snb-b-feat-text">'+f.t+'</div></div>';});
    h+='</div><a href="'+RESA+'" class="snb-b-cta" style="background:linear-gradient(135deg,'+c+',rgba('+crgb+',0.7))">Obtenir un devis</a></div></div>';
    return h;
  }
  function slides(c){c.querySelectorAll('[data-snb-slide]').forEach(function(sl){var imgs=sl.querySelectorAll('img');if(imgs.length<2)return;var cur=0;setInterval(function(){imgs[cur].classList.remove('snb-active');cur=(cur+1)%imgs.length;imgs[cur].classList.add('snb-active');},3000);});}
  fetch(API).then(function(r){return r.json();}).then(function(data){
    var bornes=(data.bornes||[]).filter(function(b){return ALLOWED.indexOf(b.id)!==-1;});
    bornes.sort(function(a,b){return ALLOWED.indexOf(a.id)-ALLOWED.indexOf(b.id);});
    var promoText=(data.settings&&data.settings.promoText)||'Promo';
    if(!bornes.length) return;
    var h='';bornes.forEach(function(b){h+=card(b,promoText);});
    target.innerHTML=h;
    slides(target);
  }).catch(function(e){console.error('[Bornes ${escapeHtml(c.ville)}]',e);});
})();
</script>`;
}

function tplAssistance(c) {
  return `<style>
.assist-section{position:relative;padding:60px 24px;max-width:1300px;margin:0 auto;overflow:hidden}
.assist-section::before{content:'';position:absolute;top:-30px;right:-80px;width:360px;height:360px;background:radial-gradient(circle,rgba(2,80,255,0.07) 0%,transparent 70%);filter:blur(65px);animation:pulse-glow 6s ease-in-out infinite alternate;pointer-events:none;z-index:0}
@keyframes pulse-glow{0%{transform:scale(1);opacity:0.7}100%{transform:scale(1.15);opacity:1}}
.assist-card{position:relative;z-index:1;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:32px;background:#1e1e2e;border-radius:16px;padding:36px 40px;border:1px solid rgba(255,255,255,0.06);box-shadow:0 20px 60px -15px rgba(0,0,0,0.3);max-width:960px;margin:0 auto}
.assist-card::before{content:'';position:absolute;top:16px;bottom:16px;left:-1px;width:3px;border-radius:3px;background:linear-gradient(180deg,#0250FF,#4d8aff,#0250FF);box-shadow:0 0 14px rgba(2,80,255,0.3)}
.assist-icon-wrap{width:68px;height:68px;border-radius:16px;background:linear-gradient(135deg,#0250FF,#4d8aff);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(2,80,255,0.3);flex-shrink:0;position:relative}
.assist-icon-wrap::after{content:'';position:absolute;inset:-4px;border-radius:20px;border:2px solid rgba(2,80,255,0.25);animation:ping 2.5s cubic-bezier(0,0,0.2,1) infinite}
@keyframes ping{0%{transform:scale(1);opacity:0.6}75%,100%{transform:scale(1.25);opacity:0}}
.assist-icon-wrap svg{width:32px;height:32px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.assist-text h3{font-size:28px;font-weight:700;line-height:1.3;color:#f0f0f5;margin-bottom:8px}
.assist-text h3 span{background:linear-gradient(135deg,#0250FF,#4d8aff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.assist-text .assist-body{font-size:15px;color:#999;line-height:1.6;margin-bottom:14px;max-width:480px}
.assist-text .assist-highlight{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#4d8aff;background:rgba(2,80,255,0.10);border:1px solid rgba(2,80,255,0.2);border-radius:10px;padding:8px 14px;line-height:1.45}
.assist-highlight svg{width:16px;height:16px;flex-shrink:0;fill:none;stroke:#4d8aff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.assist-cta{display:inline-flex;align-items:center;gap:9px;padding:14px 30px;background:linear-gradient(135deg,#0250FF,#4d8aff);color:#fff;font-family:'Raleway',sans-serif;font-size:14px;font-weight:700;text-decoration:none;border-radius:50px;border:none;cursor:pointer;position:relative;overflow:hidden;flex-shrink:0;transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)}
.assist-cta::before{content:'';position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);transform:translateX(-100%);transition:transform 0.6s ease}
.assist-cta:hover::before{transform:translateX(100%)}
.assist-cta:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(2,80,255,0.35)}
.assist-cta svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
@media(max-width:850px){.assist-section{padding:50px 20px}.assist-card{grid-template-columns:1fr;text-align:center;padding:32px 24px;gap:20px;justify-items:center}.assist-card::before{top:auto;bottom:-1px;left:20%;right:20%;width:auto;height:3px}.assist-text .assist-body{max-width:100%}.assist-text h3{font-size:24px}}
@media(max-width:480px){.assist-card{padding:26px 18px}.assist-icon-wrap{width:56px;height:56px;border-radius:14px}.assist-icon-wrap svg{width:26px;height:26px}.assist-text h3{font-size:21px}.assist-text .assist-body{font-size:14px}.assist-highlight{font-size:12px;padding:7px 12px}.assist-cta{padding:12px 24px;font-size:13px}}
</style>

<section class="assist-section">
  <div class="assist-card">
    <div class="assist-icon-wrap"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg></div>
    <div class="assist-text">
      <h3>Assistance <span>7j/7</span></h3>
      <p class="assist-body">Un doute lors de l'installation le samedi soir ? Notre équipe technique reste joignable par téléphone pour vous accompagner en direct à ${escapeHtml(c.ville)}.</p>
      <div class="assist-highlight">
        <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        Technicien disponible de 8h à minuit, 7 jours sur 7
      </div>
    </div>
    <a href="tel:+33145016666" class="assist-cta">
      <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
      01.45.01.66.66
    </a>
  </div>
</section>`;
}

function tplInstall(c) {
  return `<style>
.install-section{position:relative;padding:60px 24px;overflow:hidden}
.install-inner{max-width:1300px;margin:0 auto;position:relative;z-index:1}
.install-section::before{content:'';position:absolute;top:40px;left:-60px;width:420px;height:420px;background:radial-gradient(circle,rgba(229,25,129,0.09) 0%,transparent 70%);filter:blur(70px);animation:pulse-glow 6s ease-in-out infinite alternate;pointer-events:none;z-index:0}
.install-section::after{content:'';position:absolute;bottom:0;right:-40px;width:350px;height:350px;background:radial-gradient(circle,rgba(2,80,255,0.06) 0%,transparent 70%);filter:blur(65px);animation:pulse-glow 6s 3s ease-in-out infinite alternate;pointer-events:none;z-index:0}
@keyframes pulse-glow{0%{transform:scale(1);opacity:0.7}100%{transform:scale(1.15);opacity:1}}
.install-header{text-align:center;margin-bottom:48px}
.install-badge{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:#E51981;margin-bottom:18px}
.install-badge::before,.install-badge::after{content:'';width:24px;height:3px;border-radius:3px;background:linear-gradient(90deg,#E51981,#ff6eb4)}
.install-title{font-size:50px;font-weight:900;font-style:italic;line-height:1.08;margin-bottom:20px}
.install-title .accent{background:linear-gradient(135deg,#E51981,#ff6eb4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.install-intro{font-size:16.5px;line-height:1.65;color:#555;max-width:680px;margin:0 auto}
.steps-wrapper{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-bottom:48px;max-width:880px;margin-left:auto;margin-right:auto;position:relative}
.steps-wrapper::before{content:'';position:absolute;top:50%;left:12%;right:12%;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(229,25,129,0.08),#E51981,rgba(229,25,129,0.08));z-index:0;transform:translateY(-50%)}
.step-card{position:relative;z-index:1}
.step-inner{background:linear-gradient(145deg,#f5eaf9,#ecdaf3);border-radius:14px;padding:18px 16px 20px;text-align:center;border:1.5px solid rgba(229,25,129,0.2);box-shadow:inset 3px 3px 6px rgba(180,140,200,0.15),inset -2px -2px 5px rgba(255,255,255,0.7),3px 3px 10px rgba(180,140,200,0.12);transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)}
.step-inner:hover{transform:translateY(-3px) scale(1.01)}
.step-img-wrap{width:100%;aspect-ratio:16/10;border-radius:10px;margin-bottom:12px;overflow:hidden;position:relative}
.step-img-wrap img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.step-card:nth-child(2) .step-inner{border-color:rgba(2,80,255,0.2)}
.step-card:nth-child(3) .step-inner{border-color:rgba(22,163,74,0.2)}
.step-label{font-size:17px;font-weight:900;font-style:italic;margin-bottom:4px;color:#323338}
.step-desc{font-size:12.5px;line-height:1.5;color:#666}
.plugplay-banner{display:flex;align-items:center;gap:24px;background:#1e1e2e;border-radius:16px;padding:26px 30px;border:1px solid rgba(255,255,255,0.06);box-shadow:0 20px 60px -15px rgba(0,0,0,0.25);max-width:880px;margin:0 auto}
.plugplay-icon{flex-shrink:0;width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#E51981,#ff3fac);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(229,25,129,0.3)}
.plugplay-icon svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2}
.plugplay-text h3{font-size:17px;font-weight:900;font-style:italic;color:#f0f0f5;margin-bottom:3px}
.plugplay-text h3 span{background:linear-gradient(135deg,#E51981,#ff6eb4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.plugplay-text p{font-size:13px;color:#999;line-height:1.5}
.plugplay-cta{flex-shrink:0;display:inline-flex;align-items:center;gap:8px;padding:12px 26px;background:linear-gradient(135deg,#E51981,#ff3fac);color:#fff;font-size:13.5px;font-weight:700;text-decoration:none;border-radius:50px;transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94);position:relative;overflow:hidden}
.plugplay-cta:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(229,25,129,0.3)}
.plugplay-cta svg{width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2.2}
@media(max-width:850px){.install-section{padding:40px 20px}.install-title{font-size:32px}.steps-wrapper{grid-template-columns:1fr;max-width:300px;gap:28px}.steps-wrapper::before{display:none}.plugplay-banner{flex-direction:column;text-align:center;padding:22px 18px;gap:14px}}
@media(max-width:480px){.install-title{font-size:28px}}
</style>

<section class="install-section">
  <div class="install-inner">
    <div class="install-header">
      <div class="install-badge">Plug &amp; Play</div>
      <h2 class="install-title">Votre photobooth installé<br>en <span class="accent">5 minutes chrono</span></h2>
      <p class="install-intro">Pas besoin d'être ingénieur pour animer votre soirée à ${escapeHtml(c.ville)}. Nos bornes ont été pensées pour être opérationnelles en un temps record, partout dans le ${escapeHtml(c.dept)}.</p>
    </div>
    <div class="steps-wrapper">
      <div class="step-card"><div class="step-inner"><div class="step-img-wrap"><img src="/site-images/img_5173-1775210401691.webp" alt="Étape 1 : déballer le photobooth livré à ${escapeHtml(c.ville)}" style="object-position:50% 100%;object-fit:cover"></div><div class="step-label">Déballez</div><p class="step-desc">Sortez la borne de sa valise de transport, livrée directement chez vous.</p></div></div>
      <div class="step-card"><div class="step-inner"><div class="step-img-wrap"><img src="/site-images/img_5184-1775210424012.webp" alt="Étape 2 : emboîter les éléments du photobooth sans outil" style="object-position:50% 82%;object-fit:cover"></div><div class="step-label">Emboîtez</div><p class="step-desc">Montez la borne rapidement et sans aucun outil.</p></div></div>
      <div class="step-card"><div class="step-inner"><div class="step-img-wrap"><img src="/site-images/img_5206-1775210434167.webp" alt="Étape 3 : brancher le photobooth, allumage automatique" style="object-position:50% 70%;object-fit:cover"></div><div class="step-label">Branchez</div><p class="step-desc">Branchez la prise et votre borne s'allume automatiquement.</p></div></div>
    </div>
    <div class="plugplay-banner">
      <div class="plugplay-icon"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg></div>
      <div class="plugplay-text"><h3>100 % <span>Plug &amp; Play</span></h3><p>Oubliez les notices complexes. Branchez la prise, l'écran s'allume, et vos invités sont prêts à shooter.</p></div>
      <a href="https://shootnbox.fr/reservation/" class="plugplay-cta">Réserver <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a>
    </div>
  </div>
</section>`;
}

function tplPourquoi(c) {
  return `<style>
.why-section{position:relative;padding:27px 24px;overflow:hidden}
.why-inner{max-width:1300px;margin:0 auto;position:relative;z-index:1}
.why-section::before{content:'';position:absolute;top:-40px;left:-70px;width:400px;height:400px;background:radial-gradient(circle,rgba(229,25,129,0.09) 0%,transparent 70%);filter:blur(70px);animation:pulse-glow 6s ease-in-out infinite alternate;pointer-events:none;z-index:0}
.why-section::after{content:'';position:absolute;bottom:-20px;right:-60px;width:340px;height:340px;background:radial-gradient(circle,rgba(2,80,255,0.06) 0%,transparent 70%);filter:blur(65px);animation:pulse-glow 6s 3s ease-in-out infinite alternate;pointer-events:none;z-index:0}
@keyframes pulse-glow{0%{transform:scale(1);opacity:0.7}100%{transform:scale(1.15);opacity:1}}
.why-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:56px;align-items:center}
.why-visuals{position:relative;min-height:440px}
.photo-frame{position:absolute;border-radius:14px;overflow:hidden;transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)}
.photo-wedding{width:280px;height:340px;top:0;left:10px;transform:rotate(-3deg);z-index:2;box-shadow:inset 3px 3px 6px rgba(180,140,200,0.15),inset -2px -2px 5px rgba(255,255,255,0.7),6px 8px 24px rgba(180,140,200,0.18);border:2px solid rgba(229,25,129,0.25)}
.photo-corporate{width:240px;height:280px;bottom:0;right:20px;transform:rotate(2.5deg);z-index:3;box-shadow:inset 3px 3px 6px rgba(180,140,200,0.15),inset -2px -2px 5px rgba(255,255,255,0.7),6px 8px 24px rgba(180,140,200,0.18);border:2px solid rgba(2,80,255,0.25)}
.photo-tag{position:absolute;bottom:14px;left:14px;padding:6px 14px;border-radius:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;backdrop-filter:blur(8px);z-index:4}
.photo-wedding .photo-tag{background:rgba(229,25,129,0.85);color:#fff}
.photo-corporate .photo-tag{background:rgba(2,80,255,0.85);color:#fff}
.why-badge{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:#E51981;margin-bottom:18px}
.why-badge::before{content:'';width:28px;height:3px;border-radius:3px;background:linear-gradient(90deg,#E51981,#ff6eb4)}
.why-title{font-size:50px;font-weight:900;font-style:italic;line-height:1.08;margin-bottom:24px}
.why-title .accent-rose{background:linear-gradient(135deg,#E51981,#ff6eb4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.why-title .accent-blue{background:linear-gradient(135deg,#0250FF,#4d8aff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.why-usecases{display:flex;flex-direction:column;gap:16px}
.usecase{display:flex;align-items:flex-start;gap:14px;padding:18px 20px;border-radius:14px;background:linear-gradient(145deg,#f5eaf9,#ecdaf3);border:1.5px solid rgba(229,25,129,0.15);box-shadow:inset 3px 3px 6px rgba(180,140,200,0.12),inset -2px -2px 5px rgba(255,255,255,0.7),3px 3px 10px rgba(180,140,200,0.1);transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)}
.usecase:hover{transform:translateY(-2px)}
.usecase.uc-corporate{border-color:rgba(2,80,255,0.15);background:linear-gradient(145deg,#eaeffa,#dce4f5)}
.usecase-icon{flex-shrink:0;width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center}
.uc-wedding .usecase-icon{background:linear-gradient(135deg,#E51981,#ff3fac);box-shadow:0 4px 14px rgba(229,25,129,0.25)}
.uc-corporate .usecase-icon{background:linear-gradient(135deg,#0250FF,#4d8aff);box-shadow:0 4px 14px rgba(2,80,255,0.25)}
.usecase-icon svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2}
.usecase-content h3{font-size:16px;font-weight:900;font-style:italic;margin-bottom:4px;color:#323338}
.usecase-content p{font-size:13.5px;line-height:1.55;color:#666}
.why-cta{display:inline-flex;align-items:center;gap:9px;padding:16px 38px;margin-top:24px;background:linear-gradient(135deg,#E51981,#ff3fac);color:#fff;font-size:17px;font-weight:700;text-decoration:none;border-radius:50px;box-shadow:0 6px 24px rgba(229,25,129,0.35);transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94);position:relative;overflow:hidden}
.why-cta:hover{transform:translateY(-3px);box-shadow:0 10px 32px rgba(229,25,129,0.45)}
.why-cta svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.2}
@media(max-width:850px){.why-section{padding:40px 20px}.why-title{font-size:32px}.why-grid{grid-template-columns:1fr;gap:44px}.why-text{order:1;text-align:center}.why-visuals{order:2;min-height:320px;display:flex;justify-content:center}.photo-wedding{position:relative;top:auto;left:auto;width:200px;height:250px;margin-right:-30px}.photo-corporate{position:relative;bottom:auto;right:auto;width:180px;height:220px;margin-left:-30px;margin-top:30px}.why-usecases{max-width:420px;margin:0 auto}}
@media(max-width:480px){.why-title{font-size:28px}.photo-wedding{width:160px;height:200px}.photo-corporate{width:145px;height:180px}}
</style>

<section class="why-section">
  <div class="why-inner">
  <div class="why-grid">
    <div class="why-visuals">
      <div class="photo-frame photo-wedding">
        <img src="/site-images/gemini_generated_image_n2rdxan2rdxan2rd-1774349186670.webp" alt="Photobooth lors d'un mariage à ${escapeHtml(c.ville)}, invités souriants devant la borne photo" width="280" height="340" style="width:100%;height:100%;object-fit:cover" loading="lazy">
        <div class="photo-tag">Mariage</div>
      </div>
      <div class="photo-frame photo-corporate">
        <img src="/site-images/gemini_generated_image_bq16vwbq16vwbq16--1--1774349253571.webp" alt="Photobooth lors d'une soirée d'entreprise à ${escapeHtml(c.ville)}, cadres personnalisés au logo" width="240" height="280" style="width:100%;height:100%;object-fit:cover" loading="lazy">
        <div class="photo-tag">Entreprise</div>
      </div>
    </div>
    <div class="why-text">
      <div class="why-badge">${escapeHtml(c.ville)} &amp; événements</div>
      <h2 class="why-title">Pourquoi installer un photobooth pour votre <span class="accent-rose">mariage</span> ou <span class="accent-blue">événement pro</span> à ${escapeHtml(c.ville)} ?</h2>
      <div class="why-usecases">
        <div class="usecase uc-wedding"><div class="usecase-icon"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></div><div class="usecase-content"><h3>Mariages &amp; célébrations à ${escapeHtml(c.ville)}</h3><p>Offrez à vos invités des souvenirs instantanés avec accessoires festifs. Découvrez nos formules <a href="https://shootnbox.fr/photobooth-mariage/" style="color:#E51981;font-weight:600;text-decoration:underline;text-decoration-style:dotted">photobooth mariage</a> conçues pour transformer chaque photo en cadeau à emporter.</p></div></div>
        <div class="usecase uc-corporate"><div class="usecase-icon"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg></div><div class="usecase-content"><h3>Événements d'entreprise dans le ${c.deptCode}</h3><p>Cadres personnalisés à votre logo, impressions brandées, galerie partageable : nos solutions <a href="https://shootnbox.fr/photobooth-soiree-entreprise/" style="color:#0250FF;font-weight:600;text-decoration:underline;text-decoration-style:dotted">photobooth entreprise</a> habillent séminaires, lancements produits et soirées d'équipe à ${escapeHtml(c.ville)} et dans tout le ${escapeHtml(c.dept)}.</p></div></div>
      </div>
      <a href="https://shootnbox.fr/reservation/" class="why-cta">Découvrir nos offres <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
    </div>
  </div>
  </div>
</section>`;
}

function tplOptions() {
  return `<style>
.opt-section{padding:60px 24px;max-width:1300px;margin:0 auto}
.opt-head{text-align:center;margin-bottom:36px}
.opt-head h2{font-size:36px;font-weight:900;font-style:italic;line-height:1.15;margin:0 0 12px;color:#2d1b4e}
.opt-head h2 span{background:linear-gradient(135deg,#7828C8,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.opt-head p{font-size:16px;line-height:1.6;color:#4a2d6e;max-width:680px;margin:0 auto}
.opt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:1100px;margin:0 auto}
.opt-card{background:linear-gradient(145deg,#f5eaf9,#ecdaf3);border:1.5px solid rgba(120,40,200,0.18);border-radius:16px;padding:24px 22px;text-align:center;box-shadow:inset 3px 3px 6px rgba(180,140,200,0.15),inset -2px -2px 5px rgba(255,255,255,0.7);transition:transform .3s ease}
.opt-card:hover{transform:translateY(-4px)}
.opt-icon{width:54px;height:54px;border-radius:14px;background:linear-gradient(135deg,#7828C8,#a855f7);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 6px 18px rgba(120,40,200,0.25)}
.opt-icon svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2}
.opt-card h3{font-size:18px;font-weight:900;font-style:italic;margin:0 0 8px;color:#2d1b4e}
.opt-card p{font-size:13.5px;line-height:1.55;color:#4a2d6e;margin:0}
@media(max-width:900px){.opt-grid{grid-template-columns:1fr;gap:14px}.opt-head h2{font-size:28px}}
</style>

<section class="opt-section">
  <div class="opt-head">
    <h2>Quelles options pour <span>personnaliser votre borne</span> ?</h2>
    <p>Cadrez votre événement avec des options visuelles et numériques exclusives, intégrées sans surcoût technique.</p>
  </div>
  <div class="opt-grid">
    <div class="opt-card">
      <div class="opt-icon"><svg viewBox="0 0 24 24"><path d="M12 3l1.5 4.5L18 9l-3.5 3 1 5L12 14.5 8.5 17l1-5L6 9l4.5-1.5L12 3z"/></svg></div>
      <h3>Filtres digitaux</h3>
      <p>Sélection de filtres couleurs, effets vintage, noir et blanc, sépia : vos invités choisissent l'ambiance avant la photo.</p>
    </div>
    <div class="opt-card">
      <div class="opt-icon"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <h3>Galerie Web</h3>
      <p>Toutes les photos de la soirée hébergées sur une galerie privée, accessible à vos invités via un lien sécurisé.</p>
    </div>
    <div class="opt-card">
      <div class="opt-icon"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <h3>Déguisements virtuels</h3>
      <p>Chapeaux, lunettes, accessoires AR superposés à la photo : aucun objet physique à manipuler, hygiène garantie.</p>
    </div>
  </div>
</section>`;
}

function tplFaq(c, neighbors) {
  const neighborLinks = neighbors.map(n => `<a href="https://shootnbox.fr/location-photobooth-${n.slug}/">${escapeHtml(n.ville)}</a>`).join(', ');
  return `<style>
.alf-faq{padding:50px 24px;max-width:1300px;margin:0 auto;font-family:'Raleway',sans-serif;position:relative}
.alf-faq-head{text-align:center;margin:0 auto 30px;max-width:780px}
.alf-faq-eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#FF7A00;margin-bottom:10px}
.alf-faq-head h2{font-size:36px;font-weight:900;font-style:italic;line-height:1.15;margin:0 0 12px;color:#2d1b4e}
.alf-faq-head h2 .alf-faq-h-accent{background:linear-gradient(135deg,#FF7A00,#ff9a3c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.alf-faq-head p{font-size:16px;line-height:1.6;color:#4a2d6e}
.alf-faq-list{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.alf-faq-item{background:rgba(255,255,255,0.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(229,25,129,0.14);border-radius:14px;overflow:hidden;transition:border-color .25s,box-shadow .25s}
.alf-faq-item[open]{border-color:rgba(229,25,129,0.4);box-shadow:0 8px 24px rgba(229,25,129,0.08)}
.alf-faq-item summary{cursor:pointer;list-style:none;padding:18px 22px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:700;color:#2d1b4e;line-height:1.4}
.alf-faq-item summary::-webkit-details-marker{display:none}
.alf-faq-item summary::after{content:'+';margin-left:auto;font-size:26px;font-weight:300;color:#E51981;transition:transform .25s;flex-shrink:0;line-height:1}
.alf-faq-item[open] summary::after{transform:rotate(45deg)}
.alf-faq-item-body{padding:0 22px 18px;font-size:15px;line-height:1.65;color:#4a2d6e}
.alf-faq-item-body strong{color:#2d1b4e}
.alf-faq-item-body a{color:#E51981;font-weight:600;text-decoration:none;border-bottom:1px dotted rgba(229,25,129,0.4)}
.alf-faq-item-body a:hover{border-bottom-style:solid}
@media(max-width:600px){.alf-faq{padding:36px 16px}.alf-faq-head h2{font-size:26px}.alf-faq-item summary{font-size:15px;padding:16px 18px;gap:10px}.alf-faq-item-body{padding:0 18px 16px;font-size:14px}}
</style>

<section class="alf-faq">
  <div class="alf-faq-head">
    <span class="alf-faq-eyebrow">Questions fréquentes</span>
    <h2>Vos questions sur la location à <span class="alf-faq-h-accent">${escapeHtml(c.ville)}</span></h2>
    <p>Toutes les réponses pour louer un photobooth Shootnbox dans le ${escapeHtml(c.dept)}.</p>
  </div>
  <div class="alf-faq-list">

    <details class="alf-faq-item">
      <summary>Vous déplacez-vous le dimanche à ${escapeHtml(c.ville)} ?</summary>
      <div class="alf-faq-item-body">Oui. Nous intervenons à ${escapeHtml(c.ville)} <strong>7 jours sur 7</strong>, week-end et jours fériés compris. Un technicien reste joignable de <strong>8h à minuit</strong> par téléphone pour vous accompagner.</div>
    </details>

    <details class="alf-faq-item">
      <summary>Dans quelles autres communes du ${escapeHtml(c.dept)} intervenez-vous ?</summary>
      <div class="alf-faq-item-body">Nos équipes couvrent l'ensemble du ${escapeHtml(c.dept)} (${c.deptCode}) et la petite couronne IDF. Communes voisines de ${escapeHtml(c.ville)} desservies : ${neighborLinks}.</div>
    </details>

    <details class="alf-faq-item">
      <summary>Combien de temps faut-il pour installer la borne photo ?</summary>
      <div class="alf-faq-item-body">L'installation prend <strong>5 minutes chrono</strong> : déballer, emboîter, brancher. Aucune compétence technique requise, la borne s'allume automatiquement. Pour un mariage à ${escapeHtml(c.ville)}, vous restez concentré sur vos invités.</div>
    </details>

    <details class="alf-faq-item">
      <summary>Quels événements couvrez-vous à ${escapeHtml(c.ville)} ?</summary>
      <div class="alf-faq-item-body">Nous intervenons sur tous les types d'événements à ${escapeHtml(c.ville)} : <a href="https://shootnbox.fr/photobooth-mariage/">mariages</a>, anniversaires, baptêmes, EVJF et EVG, <a href="https://shootnbox.fr/photobooth-soiree-entreprise/">soirées d'entreprise</a> et séminaires. Que ce soit en salle municipale, en lieu privé ou à domicile, notre matériel s'adapte à tous les espaces.</div>
    </details>

    <details class="alf-faq-item">
      <summary>Faut-il une autorisation pour installer un photobooth à ${escapeHtml(c.ville)} ?</summary>
      <div class="alf-faq-item-body">Aucune autorisation administrative n'est requise tant que l'installation se fait sur un <strong>lieu privé</strong> (salle de réception, domicile, entreprise). Pour un événement sur l'espace public à ${escapeHtml(c.ville)}, contactez la mairie en amont.</div>
    </details>

  </div>
</section>`;
}

function tplAvis() {
  return fs.readFileSync(path.join(__dirname, 'snb-avis-block.html'), 'utf8');
}

// ============ SEO META ============
function buildSeoPayload(c, neighbors) {
  const allCities = [c.ville, ...neighbors.map(n => n.ville)];
  const faqEntities = [
    { name: `Vous déplacez-vous le dimanche à ${c.ville} ?`, text: `Oui. Nous intervenons à ${c.ville} 7 jours sur 7, week-end et jours fériés compris. Un technicien reste joignable de 8h à minuit par téléphone pour vous accompagner.` },
    { name: `Dans quelles autres communes du ${c.dept} intervenez-vous ?`, text: `Nos équipes couvrent l'ensemble du ${c.dept} (${c.deptCode}) et la petite couronne IDF. Communes voisines de ${c.ville} desservies : ${neighbors.map(n => n.ville).join(', ')}.` },
    { name: "Combien de temps faut-il pour installer la borne photo ?", text: `L'installation prend 5 minutes chrono : déballer, emboîter, brancher. Aucune compétence technique requise, la borne s'allume automatiquement. Pour un mariage à ${c.ville}, vous restez concentré sur vos invités.` },
    { name: `Quels événements couvrez-vous à ${c.ville} ?`, text: `Nous intervenons sur tous les types d'événements à ${c.ville} : mariages, anniversaires, baptêmes, EVJF et EVG, soirées d'entreprise et séminaires. Que ce soit en salle municipale, en lieu privé ou à domicile, notre matériel s'adapte à tous les espaces.` },
    { name: `Faut-il une autorisation pour installer un photobooth à ${c.ville} ?`, text: `Aucune autorisation administrative n'est requise tant que l'installation se fait sur un lieu privé (salle de réception, domicile, entreprise). Pour un événement sur l'espace public à ${c.ville}, contactez la mairie en amont.` }
  ];

  const customJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `https://shootnbox.fr/location-photobooth-${c.slug}/#service`,
        "name": `Location de photobooth à ${c.ville}`,
        "description": `Location de photobooth professionnel à ${c.ville} et dans tout le ${c.dept} (${c.deptCode}), à partir de 149€. Service complet de livraison, installation et récupération sur place.`,
        "serviceType": "Location de photobooth",
        "provider": { "@type": "LocalBusiness", "name": "Shootnbox", "telephone": "+33145016666", "url": "https://shootnbox.fr/", "image": "https://shootnbox.fr/images/logo/shootnbox-logo-new-1.webp", "address": { "@type": "PostalAddress", "addressLocality": "Montreuil", "postalCode": "93100", "addressRegion": "Île-de-France", "addressCountry": "FR" } },
        "areaServed": allCities.map(n => ({ "@type": "City", "name": n })),
        "offers": { "@type": "Offer", "price": "149", "priceCurrency": "EUR", "availability": "https://schema.org/InStock", "url": "https://shootnbox.fr/reservation/" },
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "reviewCount": "1192", "bestRating": "5", "worstRating": "1" }
      },
      {
        "@type": "Place",
        "name": c.ville,
        "address": { "@type": "PostalAddress", "addressLocality": c.ville, "postalCode": c.cp, "addressRegion": "Île-de-France", "addressCountry": "FR" },
        "geo": { "@type": "GeoCoordinates", "latitude": c.lat, "longitude": c.lng }
      },
      {
        "@type": "FAQPage",
        "mainEntity": faqEntities.map(q => ({ "@type": "Question", "name": q.name, "acceptedAnswer": { "@type": "Answer", "text": q.text } }))
      }
    ]
  });

  // Build title/desc dynamically — keep under SEO limits
  let title = `Location Photobooth à ${c.ville} (${c.deptCode}) dès 149€ | Shootnbox`;
  if (title.length > 65) title = `Photobooth à ${c.ville} (${c.deptCode}) dès 149€ | Shootnbox`;
  if (title.length > 65) title = `Photobooth ${c.ville} dès 149€ | Shootnbox`;

  return {
    title,
    description: `Photobooth à ${c.ville} (${c.cp}) dès 149€ : photos illimitées, impressions, animation clé en main pour mariages et événements pro. Devis en 2 clics.`.slice(0, 158),
    ogTitle: `Location de photobooth à ${c.ville} dès 149€ | Shootnbox`,
    ogDescription: `Photobooth à ${c.ville} (${c.cp}) dès 149€. Installation 5 min, photos illimitées, impressions, animation clé en main. 1192 avis Google 4,8 étoiles.`.slice(0, 158),
    canonical: `https://shootnbox.fr/location-photobooth-${c.slug}/`,
    robots: "index, follow",
    schemaType: "Service",
    schema: { type: "Service", customJsonLd, breadcrumbs: [], hasFaq: true }
  };
}

// ============ HTTP ============
function rawReq(method, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const headers = { Authorization: 'Bearer ' + TOKEN };
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    else headers['Content-Length'] = 0;
    const r = https.request({ method, hostname: HOST, path, headers, timeout: 120000 }, rs => {
      let d = '';
      rs.on('data', c => d += c);
      rs.on('end', () => resolve({ status: rs.statusCode, body: d }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(method, path, bodyObj) {
  let attempt = 0;
  while (true) {
    const r = await rawReq(method, path, bodyObj);
    if (r.status === 429) {
      attempt++;
      const wait = Math.min(65, 30 + attempt * 15);
      console.log(`    [429 rate limit] waiting ${wait}s (attempt ${attempt})`);
      await sleep(wait * 1000);
      if (attempt > 5) return r;
      continue;
    }
    if ((r.status >= 500 && r.status < 600) && attempt < 3) {
      attempt++;
      await sleep(3000);
      continue;
    }
    return r;
  }
}

async function getPageSections(slug) {
  const r = await req('GET', `/api/pages/${slug}`, null);
  if (r.status !== 200) throw new Error(`GET page failed: ${r.status}`);
  const j = JSON.parse(r.body);
  const arr = j.sections || [];
  return arr.map(s => {
    if (typeof s === 'string') return s.replace(/ /g, '-') + '.html';
    if (s && s.file) return s.file;
    if (s && s.name) return s.name.replace(/ /g, '-') + '.html';
    return null;
  }).filter(Boolean);
}

async function deleteSection(slug, file) {
  return req('DELETE', `/api/pages/${slug}/delete-section`, { file });
}

async function putSection(slug, file, content) {
  return req('PUT', `/api/pages/${slug}/section/${file}`, { content });
}

async function addSection(slug, html, position) {
  return req('POST', `/api/pages/${slug}/add-section`, { html, position });
}

async function saveSeo(slug, seo) {
  return req('POST', `/api/pages/${slug}/save`, { seo });
}

async function deploy(slug) {
  return req('POST', `/api/deploy/shootnbox/${slug}`, null);
}

// ============ ORCHESTRATOR ============
async function processCity(slug) {
  const c = CITIES[slug];
  if (!c) { console.log(`SKIP ${slug} — not in dataset`); return false; }
  c.slug = slug;
  const neighbors = getNeighbors(slug, 5);
  const dist = getDistanceTimeToDepot(slug);

  console.log(`\n=== ${c.ville} (${slug}) — ${c.deptCode} ===`);
  console.log(`  Neighbors: ${neighbors.map(n => n.ville).join(', ')}`);

  // Build new section content — strip inline <style> (loaded from /css/city-template.css instead)
  // First section gets the <link> tag prepended.
  const rawSections = [
    tplHero(c, dist),
    tplLivraison(c, neighbors, dist),
    tplTarifs(c),
    tplAssistance(c),
    tplInstall(c),
    tplPourquoi(c),
    tplOptions(),
    tplFaq(c, neighbors),
    tplAvis()
  ];
  const sectionsContent = rawSections.map((html, i) => {
    const stripped = html.replace(/<style>[\s\S]*?<\/style>\s*/g, '');
    return i === 0
      ? '<link rel="stylesheet" href="/css/city-template.css">\n' + stripped
      : stripped;
  });

  // 1. Add 9 new sections at positions 0..8 (each add renumbers, pushing existing to 100+)
  for (let i = 0; i < sectionsContent.length; i++) {
    const r = await addSection(slug, sectionsContent[i], i);
    if (r.status !== 200 && r.status !== 201) {
      console.log(`  ADD-SECTION ${i+1}/9 FAILED: ${r.status} ${r.body.slice(0,150)}`);
      throw new Error(`add-section ${i} failed`);
    }
    await sleep(500);
  }
  console.log(`  Added 9 sections (new ones at 10-90)`);

  // 2. Delete the old sections (now numbered >= 100)
  const allFiles = await getPageSections(slug);
  const oldFiles = allFiles.filter(f => {
    const m = /^(\d+)-/.exec(f);
    return m && parseInt(m[1], 10) >= 100;
  });
  for (const f of oldFiles) {
    const dr = await deleteSection(slug, f);
    if (dr.status !== 200) console.log(`  WARN delete ${f}: ${dr.status}`);
  }
  if (oldFiles.length) console.log(`  Cleaned ${oldFiles.length} old sections`);

  // 3. SEO meta + JSON-LD
  const seo = buildSeoPayload(c, neighbors);
  const sr = await saveSeo(slug, seo);
  if (sr.status !== 200) console.log(`  SAVE SEO failed: ${sr.status} ${sr.body.slice(0,200)}`);
  else console.log(`  SEO saved`);

  // 4. Deploy
  const dr = await deploy(slug);
  if (dr.status !== 200) {
    console.log(`  DEPLOY FAILED: ${dr.status} ${dr.body.slice(0,200)}`);
    return false;
  }
  const dj = JSON.parse(dr.body);
  console.log(`  ✓ Deployed: ${dj.url} (${dj.bytes} bytes)`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  let targets = [];
  if (args.includes('--all')) {
    targets = Object.keys(CITIES);
  } else if (args.includes('--test')) {
    targets = ['antony', 'saint-denis', 'versailles'];
  } else {
    targets = args.filter(a => !a.startsWith('--'));
  }
  if (targets.length === 0) {
    console.log('Usage: node build-city-template.js <slug> [<slug> ...]');
    console.log('       node build-city-template.js --test  (Antony, Saint-Denis, Versailles)');
    console.log('       node build-city-template.js --all');
    process.exit(1);
  }

  console.log(`Processing ${targets.length} cities`);
  const results = { ok: [], fail: [] };
  for (const slug of targets) {
    try {
      const ok = await processCity(slug);
      (ok ? results.ok : results.fail).push(slug);
    } catch (e) {
      console.log(`  FATAL ${slug}: ${e.message}`);
      results.fail.push(slug);
    }
    await sleep(1500);
  }
  console.log(`\n=== DONE ===`);
  console.log(`OK: ${results.ok.length} | FAIL: ${results.fail.length}`);
  if (results.fail.length) console.log(`Failed: ${results.fail.join(', ')}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
