/**
 * Script one-shot pour obtenir le refresh_token Google OAuth2
 * Usage: node scripts/google-oauth-setup.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const net = require('net');

// Charge le .env manuellement sans dépendance dotenv
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

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Manque GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET dans .env');
  process.exit(1);
}

const SCOPES = 'https://www.googleapis.com/auth/business.manage';

// Trouve un port libre automatiquement
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

(async () => {
  const PORT = await getFreePort();
  const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  console.log(`\n⚠️  IMPORTANT : Ajoute ce redirect URI dans Google Cloud Console`);
  console.log(`   Credentials → ton client Web → Authorized redirect URIs :\n`);
  console.log(`   http://localhost:${PORT}/oauth/callback\n`);
  console.log(`🔗 Puis ouvre cette URL dans ton navigateur :\n`);
  console.log(authUrl);
  console.log(`\n⏳ En attente du callback sur http://localhost:${PORT}...\n`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/oauth/callback') return;

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.end(`<h1>Erreur: ${error}</h1>`);
      console.error('❌ Erreur OAuth:', error);
      server.close();
      return;
    }

    if (!code) {
      res.end('<h1>Pas de code reçu</h1>');
      server.close();
      return;
    }

    try {
      const body = new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const tokens = await tokenRes.json();

      if (tokens.error) {
        res.end(`<h1>Erreur token: ${tokens.error_description}</h1>`);
        console.error('❌ Erreur token:', tokens);
        server.close();
        return;
      }

      res.end('<h1>✅ Succès ! Retourne dans le terminal.</h1><p>Tu peux fermer cet onglet.</p>');

      console.log('\n✅ REFRESH TOKEN OBTENU\n');
      console.log('Ajoute cette ligne dans ton .env :\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\n⚠️  Sauvegarde-le maintenant, il ne s\'affiche qu\'une fois.');

    } catch (err) {
      res.end('<h1>Erreur réseau</h1>');
      console.error('❌ Erreur fetch:', err);
    }

    server.close();
  });

  server.listen(PORT);
})();
