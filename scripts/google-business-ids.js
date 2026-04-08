/**
 * Script one-shot pour récupérer accountId et locationId Google Business
 * Usage: node scripts/google-business-ids.js
 */

const fs = require('fs');
const path = require('path');

// Charge le .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.trim().split('=');
    if (key && !key.startsWith('#') && vals.length) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('❌ Manque GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou GOOGLE_REFRESH_TOKEN dans .env');
  process.exit(1);
}

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token'
    }).toString()
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

(async () => {
  try {
    console.log('🔑 Récupération du token...');
    const accessToken = await getAccessToken();

    console.log('📋 Récupération des comptes...');
    const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const accountsData = await accountsRes.json();

    if (accountsData.error) {
      console.error('❌ Erreur accounts:', JSON.stringify(accountsData.error, null, 2));
      return;
    }

    const accounts = accountsData.accounts || [];
    if (!accounts.length) {
      console.log('❌ Aucun compte trouvé');
      return;
    }

    console.log(`\n✅ ${accounts.length} compte(s) trouvé(s) :\n`);
    for (const account of accounts) {
      console.log(`Account: ${account.name}`);
      console.log(`  Nom : ${account.accountName}`);
      console.log(`  Type: ${account.type}`);

      // Récupère les locations de ce compte
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const locData = await locRes.json();

      if (locData.locations && locData.locations.length) {
        console.log(`  Locations :`);
        for (const loc of locData.locations) {
          console.log(`    - ${loc.title || loc.name}`);
          console.log(`      name: ${loc.name}`);
        }
      } else {
        console.log(`  Locations: aucune ou accès refusé`);
        if (locData.error) console.log(`  Erreur: ${locData.error.message}`);
      }
      console.log('');
    }

    console.log('💡 Ajoute dans ton .env :');
    console.log('GOOGLE_ACCOUNT_NAME=accounts/XXXXXXXXX');
    console.log('GOOGLE_LOCATION_NAME=accounts/XXXXXXXXX/locations/XXXXXXXXX');

  } catch (err) {
    console.error('❌ Erreur:', err.message);
  }
})();
