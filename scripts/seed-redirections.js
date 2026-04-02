require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../lib/supabase');

const REDIRECTIONS = [
  // WordPress standard pages
  { source_path: '/accueil', target_path: '/', status_code: 301 },
  { source_path: '/accueil/', target_path: '/', status_code: 301 },
  { source_path: '/home-v2', target_path: '/', status_code: 301 },
  { source_path: '/home-v2/', target_path: '/', status_code: 301 },
  { source_path: '/nos-services', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-services/', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-services/photobooth', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-services/photobooth/', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-services/videobooth', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-services/videobooth/', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-tarifs', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/nos-tarifs/', target_path: '/location-photobooth/', status_code: 301 },
  { source_path: '/contactez-nous', target_path: '/contact/', status_code: 301 },
  { source_path: '/contactez-nous/', target_path: '/contact/', status_code: 301 },
  { source_path: '/notre-blog', target_path: '/blog/', status_code: 301 },
  { source_path: '/notre-blog/', target_path: '/blog/', status_code: 301 },
  { source_path: '/a-propos', target_path: '/', status_code: 301 },
  { source_path: '/a-propos/', target_path: '/', status_code: 301 },

  // WordPress technical paths (block access)
  { source_path: '/wp-admin', target_path: '/', status_code: 301 },
  { source_path: '/wp-admin/', target_path: '/', status_code: 301 },
  { source_path: '/wp-login.php', target_path: '/', status_code: 301 },
  { source_path: '/wp-content', target_path: '/', status_code: 301 },
  { source_path: '/wp-content/', target_path: '/', status_code: 301 },
  { source_path: '/xmlrpc.php', target_path: '/', status_code: 301 },
  { source_path: '/wp-json', target_path: '/', status_code: 301 },
  { source_path: '/wp-json/', target_path: '/', status_code: 301 },
  { source_path: '/feed', target_path: '/', status_code: 301 },
  { source_path: '/feed/', target_path: '/', status_code: 301 },
  { source_path: '/comments/feed', target_path: '/', status_code: 301 },
  { source_path: '/comments/feed/', target_path: '/', status_code: 301 },

  // WordPress archive/taxonomy paths
  { source_path: '/category', target_path: '/blog/', status_code: 301 },
  { source_path: '/category/', target_path: '/blog/', status_code: 301 },
  { source_path: '/tag', target_path: '/blog/', status_code: 301 },
  { source_path: '/tag/', target_path: '/blog/', status_code: 301 },
  { source_path: '/author', target_path: '/', status_code: 301 },
  { source_path: '/author/', target_path: '/', status_code: 301 },

  // Old Elementor/page-builder paths
  { source_path: '/elementor', target_path: '/', status_code: 301 },
  { source_path: '/elementor/', target_path: '/', status_code: 301 },
];

async function seedRedirections() {
  console.log('Seeding WordPress migration redirections...\n');

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const redir of REDIRECTIONS) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('site_manager_redirections')
      .select('id')
      .eq('source_path', redir.source_path)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('site_manager_redirections')
      .insert({
        source_path: redir.source_path,
        target_path: redir.target_path,
        status_code: redir.status_code,
        is_active: true,
        hit_count: 0,
        created_by: null
      });

    if (error) {
      console.error(`  ERROR: ${redir.source_path} → ${error.message}`);
      errors++;
    } else {
      console.log(`  ✓ ${redir.source_path} → ${redir.target_path} (${redir.status_code})`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (already exist), ${errors} errors`);
  console.log('Total redirections in seed:', REDIRECTIONS.length);
}

seedRedirections().catch(console.error);
