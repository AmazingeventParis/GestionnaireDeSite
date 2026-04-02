/**
 * Seed initial admin user
 * Usage: node scripts/seed-admin.js
 */
require('dotenv').config();

const supabase = require('../lib/supabase');
const { hashPassword } = require('../utils/crypto');

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  // Check if admin already exists
  const { data: existing } = await supabase
    .from('site_manager_users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    console.log('Admin user already exists:', email);
    return;
  }

  const passwordHash = await hashPassword(password);

  const { data, error } = await supabase
    .from('site_manager_users')
    .insert({
      email,
      username: 'admin',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log('Admin user created:', data.email, '(id:', data.id + ')');
}

seed().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
