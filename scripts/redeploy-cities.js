#!/usr/bin/env node
/**
 * Redeploy all city pages without modifying content.
 * Use after shared header/footer changes.
 */
const fs = require('fs');
const https = require('https');

const TOKEN = fs.readFileSync('.tmp-token.txt', 'utf8').trim();
const HOST = 'sites.swipego.app';

function rawReq(method, path) {
  return new Promise((resolve, reject) => {
    const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Length': 0 };
    const r = https.request({ method, hostname: HOST, path, headers, timeout: 120000 }, rs => {
      let d = '';
      rs.on('data', c => d += c);
      rs.on('end', () => resolve({ status: rs.statusCode, body: d }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(method, path) {
  let attempt = 0;
  while (true) {
    const r = await rawReq(method, path);
    if (r.status === 429) {
      attempt++;
      const wait = Math.min(65, 30 + attempt * 15);
      console.log(`    [429] waiting ${wait}s`);
      await sleep(wait * 1000);
      if (attempt > 5) return r;
      continue;
    }
    return r;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.log('Usage: node redeploy-cities.js <slug> [<slug>...]'); process.exit(1); }

  const results = { ok: [], fail: [] };
  for (const slug of args) {
    const r = await req('POST', `/api/deploy/shootnbox/${slug}`);
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        console.log(`✓ ${slug} → ${j.url} (${j.bytes}b)`);
        results.ok.push(slug);
      } catch (e) {
        console.log(`✓ ${slug} (parse err)`);
        results.ok.push(slug);
      }
    } else {
      console.log(`✗ ${slug}: ${r.status} ${r.body.slice(0,150)}`);
      results.fail.push(slug);
    }
    await sleep(800);
  }
  console.log(`\nDONE. OK: ${results.ok.length} | FAIL: ${results.fail.length}`);
  if (results.fail.length) console.log('Failed:', results.fail.join(', '));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
