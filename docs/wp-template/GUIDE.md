# Template Article WordPress — Shootnbox
Design identique au GestionnaireDeSite (mêmes classes CSS `snb-*`)

---

## Fichiers fournis

| Fichier | Destination dans WP | Rôle |
|---------|---------------------|------|
| `single.php` | `themes/ENFANT/single.php` | Template PHP article |
| `snb-blog.css` | `themes/ENFANT/snb-blog.css` | CSS design GDS (copie de blog-styles.css) |
| `snb-toc.js` | `themes/ENFANT/js/snb-toc.js` | Sommaire dynamique + scroll actif |
| `functions-snippet.php` | À coller dans `functions.php` | Charge CSS + JS sur les articles |

---

## Étape 1 — Préparer le thème enfant

Si tu n'as pas encore de thème enfant :

1. Dans `/wp-content/themes/`, créer un dossier `shootnbox-child/`
2. Créer `style.css` minimal :
```css
/*
Theme Name: Shootnbox Child
Template: skole-child
*/
```
3. Créer `functions.php` vide :
```php
<?php
// Shootnbox child theme
```
4. Dans WP Admin → Apparence → Thèmes → activer "Shootnbox Child"

---

## Étape 2 — Copier les fichiers

```
wp-content/themes/shootnbox-child/
├── single.php          ← template article
├── snb-blog.css        ← CSS complet (copie de GDS blog-styles.css)
├── functions.php       ← coller le contenu de functions-snippet.php
└── js/
    └── snb-toc.js      ← script sommaire
```

**Pour `snb-blog.css`** : copier le contenu de :
`GestionnaireDeSite/previews/_shared/blog-styles.css`

---

## Étape 3 — Vérifier la police Raleway

Le CSS utilise `font-family: 'Raleway', sans-serif` via Google Fonts.
Le snippet `functions.php` charge automatiquement la police.

Si le thème parent charge déjà Raleway (probable avec le thème Skole),
commenter la ligne `wp_enqueue_style('snb-raleway', ...)` dans `functions.php`.

---

## Étape 4 — Configurer les catégories WordPress

Le template mappe automatiquement les slugs WP vers les badges colorés GDS.

| Slug catégorie WP | Badge | Couleur |
|-------------------|-------|---------|
| contient `mariage` | 💍 Mariage | Rose |
| contient `entreprise` | 🏢 Entreprise | Bleu |
| contient `anniversaire` | 🎂 Anniversaire | Violet |
| contient `conseils` | 💡 Conseils | Orange |
| autre | 📝 (nom de la catégorie) | Orange |

→ Les slugs n'ont pas à être exacts, `location-mariage` sera reconnu comme `mariage`.

---

## Étape 5 — Configurer les auteurs WordPress

Le template mappe les logins/noms WP vers les identités GDS.

| Login ou display_name WP | Auteur GDS |
|--------------------------|------------|
| contient `mathilde` | Mathilde Séhault — Experte événementiel |
| contient `elise` | Élise Durant — Spécialiste photobooth |
| autre | display_name WP + "Rédactrice Shootnbox" |

→ Créer des comptes WP avec login `mathilde` et `elise` (ou les noms complets).

---

## Étape 6 — Tester en local / staging

### Test rapide

1. Ouvrir un article existant sur le site
2. Vérifier dans la source HTML que `class="snb-article-hero"` est présent
3. Vérifier que `snb-blog.css` et `snb-toc.js` se chargent (DevTools → Network)

### Checklist visuelle

- [ ] Breadcrumb visible en haut de page
- [ ] Badge catégorie coloré (rose/bleu/violet/orange)
- [ ] H1 en italic bold avec la police Raleway
- [ ] Avatar auteur avec initiales
- [ ] Image hero 16:6 avec border-radius
- [ ] Layout 2 colonnes sur desktop (contenu + sidebar)
- [ ] Sommaire (TOC) se remplit automatiquement avec les H2 de l'article
- [ ] Sidebar disparaît sur mobile (< 850px)
- [ ] Articles liés en grille de 3 en bas de page
- [ ] CTA footer violet présent

### Tester le contenu SEO Content Studio

Les articles générés par `seo.swipego.app` et publiés via le bouton
"Publier sur WordPress" contiennent déjà des classes `snb-conseil`,
`snb-highlight`, `snb-cta-card`, etc.

Ces éléments seront automatiquement stylisés par `snb-blog.css`.

---

## Étape 7 — Déployer en production

1. Vérifier que le thème enfant est actif
2. Publier un article test avec :
   - Une image à la une (16:6 idéalement, min 1300×488px)
   - Au moins 3 H2 dans le contenu (pour le TOC)
   - Une catégorie mappée (mariage, entreprise, etc.)
   - Un auteur mappé (mathilde ou elise)
3. Vérifier sur mobile que la sidebar est masquée et le layout 1 colonne

---

## Notes importantes

### Compatibilité Elementor
Le template `single.php` **remplace** Elementor pour les articles.
Elementor reste actif pour les pages normales (home, landing pages, etc.).
→ Aucun impact sur les autres pages.

### Image à la une
- Format recommandé : **1300 × 488 px** (ratio 16:6, même que GDS)
- Le SEO Content Studio redimensionne automatiquement les images hero à 1300×488

### Le contenu WordPress standard
`the_content()` est injecté tel quel dans `<article class="snb-article-body">`.
Tout le HTML `snb-*` généré par le SEO Content Studio sera correctement stylisé.
Les contenus écrits directement dans WP (éditeur Gutenberg) bénéficient aussi
du CSS pour h2, h3, p, ul, ol, tableaux, etc.

### Offset du header sticky
Dans `snb-toc.js`, la ligne `window.scrollBy(0, -100)` compense le header sticky.
Ajuster `-100` à la hauteur réelle du header (72px desktop d'après le CLAUDE.md).

---

## Résultat attendu

Un article WP aura **exactement le même rendu visuel** qu'un article GDS :
même typographie (Raleway 900 italic), mêmes couleurs Shootnbox, même sidebar,
même TOC, même CTA footer — parce qu'ils partagent le même CSS.
