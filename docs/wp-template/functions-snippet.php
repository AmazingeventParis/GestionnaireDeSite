<?php
/**
 * functions-snippet.php — À coller dans functions.php du thème enfant
 * Charge le CSS et JS du template article SNB uniquement sur les articles
 */

/**
 * Enqueue CSS + JS du template article
 */
add_action('wp_enqueue_scripts', function () {
    if (!is_single()) return;

    // CSS identique au GestionnaireDeSite blog-styles.css
    wp_enqueue_style(
        'snb-blog',
        get_stylesheet_directory_uri() . '/snb-blog.css',
        [],
        '1.0.0'
    );

    // Raleway depuis Google Fonts (même police que GDS)
    wp_enqueue_style(
        'snb-raleway',
        'https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800;1,900&display=swap',
        [],
        null
    );

    // Script TOC dynamique
    wp_enqueue_script(
        'snb-toc',
        get_stylesheet_directory_uri() . '/js/snb-toc.js',
        [],
        '1.0.0',
        true  // footer
    );
});

/**
 * Désactiver les styles par défaut d'Elementor sur les articles
 * si Elementor est actif mais qu'on n'utilise PAS Elementor pour les articles
 */
// add_filter('elementor/frontend/print_google_fonts', '__return_false'); // décommenter si besoin
