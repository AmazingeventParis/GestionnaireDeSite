/**
 * Migration script — Execute SQL migration via Supabase
 * Usage: node scripts/migrate.js
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * or uses defaults from config
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://supabase-api.swipego.app';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTI3NDIyMCwiZXhwIjo0OTI2OTQ3ODIwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.iqPsHjDWX9X2942nD1lsSin0yNvob06s0qP_FDTShns';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function migrate() {
  console.log('Reading migration SQL...');
  const sql = fs.readFileSync(path.join(__dirname, 'migration.sql'), 'utf8');

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute.`);
  console.log('');
  console.log('NOTE: This script cannot run DDL via PostgREST.');
  console.log('Please execute the SQL in scripts/migration.sql via:');
  console.log('  1. Supabase Studio SQL Editor: https://supabase.swipego.app');
  console.log('  2. Or via psql if PostgreSQL port is accessible');
  console.log('');
  console.log('After running the migration, verify tables exist:');

  // Verify tables exist
  const tables = [
    'site_manager_sites',
    'site_manager_contacts',
    'site_manager_credentials',
    'site_manager_tasks',
    'site_manager_notes',
    'site_manager_monitors'
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      console.log(`  ❌ ${table} — ${error.message}`);
    } else {
      console.log(`  ✅ ${table} — OK (${data.length} rows)`);
    }
  }
}

migrate().catch(console.error);
