<?php
/**
 * single.php — Template article de blog Shootnbox
 * Design identique au GestionnaireDeSite (même CSS snb-*)
 * À placer dans : wp-content/themes/VOTRE-THEME-ENFANT/single.php
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Retourne les infos d'affichage d'une catégorie WP
 * Mappe vers les classes CSS GDS (cat-mariage, cat-entreprise, etc.)
 */
function snb_category_info($post_id) {
    $categories = get_the_category($post_id);
    if (empty($categories)) {
        return ['label' => 'Blog', 'class' => 'cat-conseils', 'emoji' => '📝', 'link' => '/blog/'];
    }
    $cat = $categories[0];
    $slug = $cat->slug;
    // Catégorie WP par défaut "Non classé" → afficher "Blog"
    if ($slug === 'uncategorized' || $slug === 'non-classe' || $slug === 'non-classifie') {
        return ['label' => 'Blog', 'class' => 'cat-conseils', 'emoji' => '&#x1F4DD;', 'link' => home_url('/blog/')];
    }
    $map = [
        'mariage'      => ['class' => 'cat-mariage',      'emoji' => '&#x1F48D;'],
        'entreprise'   => ['class' => 'cat-entreprise',   'emoji' => '&#x1F3E2;'],
        'anniversaire' => ['class' => 'cat-anniversaire', 'emoji' => '&#x1F382;'],
        'conseils'     => ['class' => 'cat-conseils',     'emoji' => '&#x1F4A1;'],
    ];
    // Cherche une correspondance partielle dans le slug
    $matched = null;
    foreach ($map as $key => $info) {
        if (strpos($slug, $key) !== false || strpos(strtolower($cat->name), $key) !== false) {
            $matched = $info;
            break;
        }
    }
    if (!$matched) $matched = ['class' => 'cat-conseils', 'emoji' => '&#x1F4DD;'];
    return [
        'label' => $cat->name,
        'class' => $matched['class'],
        'emoji' => $matched['emoji'],
        'link'  => get_category_link($cat->term_id),
    ];
}

/**
 * Estime le temps de lecture en minutes (base 230 mots/min)
 */
function snb_read_time($post_id) {
    $content = get_post_field('post_content', $post_id);
    $text    = wp_strip_all_tags($content);
    $words   = str_word_count($text);
    return max(1, round($words / 230));
}

/**
 * Retourne le nom complet de l'auteur WP
 * Mappe les logins connus vers les noms du design GDS
 */
function snb_author_info($post) {
    $login = get_the_author_meta('user_login', $post->post_author);
    $name  = get_the_author_meta('display_name', $post->post_author);
    $map = [
        'mathilde'  => ['name' => 'Mathilde Séhault',  'initials' => 'M', 'role' => 'Experte événementiel & animation de soirée'],
        'elise'     => ['name' => 'Élise Durant',       'initials' => 'É', 'role' => 'Spécialiste photobooth & expérience client'],
        'francois'  => ['name' => 'François Le Bail',   'initials' => 'F', 'role' => 'Expert photobooth & expérience événementielle'],
        'francoise' => ['name' => 'Françoise Le Bail',  'initials' => 'F', 'role' => 'Expert photobooth & expérience événementielle'],
        'admin'     => ['name' => 'Équipe Shootnbox',   'initials' => 'S', 'role' => 'L\'équipe Shootnbox'],
    ];
    foreach ($map as $key => $info) {
        if (strpos(strtolower($login), $key) !== false || strpos(strtolower($name), $key) !== false) {
            return $info;
        }
    }
    // Auteur WP générique
    $initials = strtoupper(substr($name, 0, 1));
    return ['name' => $name, 'initials' => $initials, 'role' => 'Rédactrice Shootnbox'];
}

/**
 * Formate une date en français
 */
function snb_date_fr($date_str) {
    $months = ['', 'janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    $ts = strtotime($date_str);
    return date('j', $ts) . ' ' . $months[(int)date('n', $ts)] . ' ' . date('Y', $ts);
}

/**
 * Articles liés (même catégorie, hors article courant)
 */
function snb_related_articles($post_id, $count = 3) {
    $cats = wp_get_post_categories($post_id);
    if (empty($cats)) return [];
    $query = new WP_Query([
        'post_type'      => 'post',
        'post_status'    => 'publish',
        'posts_per_page' => $count,
        'post__not_in'   => [$post_id],
        'category__in'   => $cats,
        'orderby'        => 'date',
        'order'          => 'DESC',
    ]);
    return $query->posts;
}

// ── Données de l'article ───────────────────────────────────────────────────

get_header();

while (have_posts()) : the_post();

$post_id   = get_the_ID();
$cat_info  = snb_category_info($post_id);
$author    = snb_author_info($post);
$read_time = snb_read_time($post_id);
$date_fr   = snb_date_fr(get_the_date('Y-m-d'));
$tags      = get_the_tags();
$related   = snb_related_articles($post_id);

$hero_url  = get_the_post_thumbnail_url($post_id, 'full');
$hero_alt  = get_the_post_thumbnail_caption($post_id) ?: get_the_title();

$current_url = (is_ssl() ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
$fb_share  = 'https://www.facebook.com/sharer/sharer.php?u=' . urlencode($current_url);
$tw_share  = 'https://twitter.com/intent/tweet?url=' . urlencode($current_url) . '&text=' . urlencode(get_the_title());

?>

<!-- ── BREADCRUMB ── -->
<nav class="snb-breadcrumb" aria-label="Fil d'Ariane">
  <a href="<?php echo home_url('/'); ?>">Accueil</a>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
  <a href="<?php echo home_url('/blog/'); ?>">Blog</a>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
  <a href="<?php echo esc_url($cat_info['link']); ?>"><?php echo esc_html($cat_info['label']); ?></a>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
  <span class="current"><?php the_title(); ?></span>
</nav>

<!-- ── HERO ── -->
<header class="snb-article-hero">
  <div class="snb-article-meta-top">
    <span class="snb-cat-badge <?php echo esc_attr($cat_info['class']); ?>">
      <?php echo $cat_info['emoji']; ?> <?php echo esc_html($cat_info['label']); ?>
    </span>
    <span class="snb-article-date"><?php echo esc_html($date_fr); ?></span>
    <span class="snb-article-read-time">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <?php echo $read_time; ?> min de lecture
    </span>
  </div>

  <h1 class="snb-article-title"><?php the_title(); ?></h1>

  <div class="snb-author-row">
    <div class="snb-author-avatar"><?php echo esc_html($author['initials']); ?></div>
    <div class="snb-author-info">
      <span class="snb-author-name"><?php echo esc_html($author['name']); ?></span>
      <span class="snb-author-role"><?php echo esc_html($author['role']); ?></span>
    </div>
    <div class="snb-author-sep"></div>
    <div class="snb-share-mini">
      <span class="share-label">Partager</span>
      <a class="snb-share-btn" href="<?php echo esc_url($fb_share); ?>" target="_blank" rel="noopener" aria-label="Facebook">
        <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
      </a>
      <a class="snb-share-btn" href="<?php echo esc_url($tw_share); ?>" target="_blank" rel="noopener" aria-label="X / Twitter">
        <svg viewBox="0 0 24 24"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.4 5.5 3.9 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
      </a>
      <a class="snb-share-btn" href="#" aria-label="Copier le lien" id="snb-copy-link">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      </a>
    </div>
  </div>

  <div class="snb-hero-img-wrap">
    <?php if ($hero_url) : ?>
      <img src="<?php echo esc_url($hero_url); ?>"
           alt="<?php echo esc_attr($hero_alt); ?>"
           loading="eager" fetchpriority="high"
           width="1300" height="488">
    <?php endif; ?>
    <span class="snb-hero-img-caption">&copy; Shootnbox</span>
  </div>
</header>

<!-- ── LAYOUT 2 COLONNES : CONTENU + SIDEBAR ── -->
<div class="snb-article-layout">

  <!-- Colonne contenu -->
  <div class="snb-article-body-col">
    <article class="snb-article-body">
      <?php the_content(); ?>

      <!-- Tags -->
      <?php if ($tags) : ?>
        <div class="snb-sep"></div>
        <div class="snb-tags">
          <?php foreach ($tags as $tag) : ?>
            <a href="<?php echo esc_url(get_tag_link($tag->term_id)); ?>" class="snb-tag">
              #<?php echo esc_html($tag->name); ?>
            </a>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>

      <!-- CTA footer article -->
      <div class="snb-cta-footer">
        <div class="snb-cta-footer-badge">&#x1F4F8; Shootnbox</div>
        <p class="snb-cta-footer-title">Prêt à <span>immortaliser votre événement</span> ?</p>
        <p>Obtenez un devis personnalisé en 2 minutes.</p>
        <a href="<?php echo home_url('/reservation/'); ?>" class="snb-cta-footer-btn">
          Estimer mon tarif
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div>
    </article>

    <!-- ── BIO AUTEUR ── -->
    <?php
    $author_bio = get_the_author_meta('description', $post->post_author);
    if (!$author_bio) {
        $author_bio = esc_html($author['name']) . ' fait partie de l\'équipe Shootnbox, passionnée par l\'événementiel et la photographie. Elle partage son expertise pour vous aider à créer des souvenirs inoubliables lors de vos événements.';
    }
    ?>
    <div class="snb-author-bio">
      <div class="snb-author-bio-avatar"><?php echo esc_html($author['initials']); ?></div>
      <div class="snb-author-bio-content">
        <span class="snb-author-bio-label">À propos de l'auteur·e</span>
        <strong class="snb-author-bio-name"><?php echo esc_html($author['name']); ?></strong>
        <span class="snb-author-bio-role"><?php echo esc_html($author['role']); ?></span>
        <p class="snb-author-bio-text"><?php echo esc_html($author_bio); ?></p>
      </div>
    </div>

    <!-- ── COMMENTAIRES ── -->
    <?php if (comments_open() || get_comments_number()) : ?>
    <div class="snb-comments-wrap">
      <?php comments_template(); ?>
    </div>
    <?php endif; ?>

  </div>

  <!-- Sidebar sticky -->
  <aside class="snb-sidebar">

    <!-- Sommaire (TOC — rempli par snb-toc.js) -->
    <nav class="snb-toc" aria-label="Sommaire" id="snb-toc-nav">
      <div class="snb-toc-title">Sommaire</div>
      <ul id="snb-toc-list"><!-- rempli par JS --></ul>
    </nav>

    <!-- CTA sidebar -->
    <div class="snb-sidebar-cta">
      <span class="sc-label">Location photobooth</span>
      <div class="sc-title">Animation <span>Mariage</span></div>
      <div class="sc-price">299&euro;</div>
      <div class="sc-period">par événement &mdash; livraison incluse</div>
      <a href="<?php echo home_url('/reservation/'); ?>" class="sc-btn">Obtenir mon devis</a>
    </div>

    <!-- Articles liés sidebar -->
    <?php if (!empty($related)) : ?>
      <div class="snb-sidebar-related">
        <div class="sr-title">À lire aussi</div>
        <ul>
          <?php foreach ($related as $rel) :
            $rel_thumb = get_the_post_thumbnail_url($rel->ID, 'thumbnail');
          ?>
            <li>
              <a href="<?php echo esc_url(get_permalink($rel->ID)); ?>">
                <div class="sr-link-thumb">
                  <?php if ($rel_thumb) : ?>
                    <img src="<?php echo esc_url($rel_thumb); ?>" alt="" loading="lazy">
                  <?php endif; ?>
                </div>
                <span class="sr-link-title"><?php echo esc_html($rel->post_title); ?></span>
              </a>
            </li>
          <?php endforeach; ?>
        </ul>
      </div>
    <?php endif; ?>

  </aside>
</div>


<?php endwhile; ?>

<?php get_footer(); ?>
