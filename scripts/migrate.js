/**
 * Migration verification script
 * Usage: node scripts/migrate.js
 *
 * DDL must be run manually via Supabase Studio SQL Editor.
 * This script verifies all tables exist after migration.
 */
require('dotenv').config();

const supabase = require('../lib/supabase');

async function migrate() {
  console.log('Gestionnaire de Site — Migration Verification');
  console.log('=============================================\n');
  console.log('Run scripts/migration-v2.sql via Supabase Studio:');
  console.log('  https://supabase.swipego.app\n');
  console.log('Verifying tables...\n');

  const tables = [
    'site_manager_sites',
    'site_manager_contacts',
    'site_manager_credentials',
    'site_manager_tasks',
    'site_manager_notes',
    'site_manager_monitors',
    'site_manager_users',
    'site_manager_sessions',
    'site_manager_audit_log',
    'site_manager_login_attempts',
    'site_manager_ip_bans',
    'site_manager_security_events',
    'site_manager_backups',
    'site_manager_redirections',
    'site_manager_scheduled_publishes'
  ];

  let ok = 0;
  let missing = 0;

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      console.log(`  MISSING  ${table}`);
      missing++;
    } else {
      console.log(`  OK       ${table} (${data.length} rows)`);
      ok++;
    }
  }

  console.log(`\nResult: ${ok} OK, ${missing} missing`);

  if (missing > 0) {
    console.log('\nPlease run migration-v2.sql in Supabase Studio SQL Editor.');
    process.exit(1);
  }

  console.log('\nAll tables verified successfully!');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
