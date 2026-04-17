# Gestionnaire de Site — Shootnbox

## Architecture

- **Framework** : Node.js + Express
- **Frontend admin** : HTML statique dans `public/` (dark GitHub theme)
- **Pages du site** : Sections HTML dans `previews/{slug}/` assemblees par `routes/pages.js` (preview) et `scripts/build.js` (publication)
- **Shared** : Header/footer dans `previews/_shared/`
- **Config** : `site-config.json` (couleurs, typo, header, footer, SEO, deploy)
- **BDD** : Supabase PostgreSQL (users, sessions, audit, redirections, etc.)
- **Deploy** : Docker + Coolify sur OVH 217.182.89.133
- **Volumes Docker persistants** : `gds-previews`, `gds-site-images`, `gds-blocks`, `gds-backups`

## Conventions de code

- **JS admin** : Vanilla JS, pas de framework, IIFE pattern
- **CSS admin** : Dark theme (#0d1117 bg, #161b22 cards, #30363d borders, #e6edf3 text)
- **Sections HTML** : Standalone (avec `<!DOCTYPE>`, `<head>`, `<style>`, `<body>`) ou fragments
- **API** : REST, auth JWT, RBAC (admin/editor/viewer)
- **Pas de** : jQuery, Bootstrap, FontAwesome, React

## Regles de developpement CRITIQUES

### Images et medias
- **Toutes les images uploadees sont converties en WebP** (qualite 75, max 1200px)
- **Videos** : MP4 copiees directement (pas de conversion)
- **Limite upload** : 50 MB
- Le serveur (`routes/media.js`) gere la conversion automatiquement via Sharp

### Sections et preview
- **Standalone blocks** (avec `<body>`) : CSS scope avec `#gds-s-{filename}` pour eviter les conflits
- **Fragments** (sans `<body>`) : CSS inline garde tel quel, pas de scoping
- **Regles CSS strippees automatiquement** : `body{}`, `html{}`, `*,*::before,*::after{}`, `@import url()`
- **max-width sur section** : automatiquement deplace sur le wrapper div par la preview route
- **Scripts** : extraits des sections et reinjectes en fin de `<body>`

### Nettoyage serveur (PUT /section/:file)
- Le serveur nettoie automatiquement avant sauvegarde :
  - Prefixes CSS scopes `#gds-s-xxx`
  - Elements admin (gds-tag-select, gds-ph-overlay, gds-section-actions)
  - Attributs admin (data-gds-edit, data-gds-section, data-gds-tag, data-gds-img, tabindex, contenteditable)
- **Ne jamais** sauvegarder du HTML contenant ces elements dans les fichiers preview

### Placeholders d'images
- Detectes par : `[class*="placeholder"]`, `[data-gds-placeholder]`, ou `border-style: dashed`
- Pour les noms de classes non-standards, ajouter `data-gds-placeholder` sur l'element
- Au survol : overlay "Ajouter une image" (upload ou URL)
- **Double-clic** sur n'importe quelle image pour la remplacer (fonctionne meme derriere les overlays)

### Espacements entre blocs
- Stockes dans `.spacing.json` par page (file -> px)
- Appliques comme `margin-top` sur le wrapper du bloc du dessous
- Slider dans l'editeur : -100px a 200px

### Historique / Versions (Backup)
- **Snapshot automatique** avant : sauvegarde texte/SEO, edition section HTML, reordonnancement sections, restauration
- Fonction helper `createSnapshot(slug, userId, reason)` dans `routes/pages.js`
- Chaque snapshot contient : toutes les sections HTML + SEO + espacements (.spacing.json)
- Reason trackee : `save`, `section-edit:fichier.html`, `reorder`, `before-restore`
- Stockes dans `.history/` par page (30 derniers gardes)
- **Restauration** via API + UI dans page-code.html ET bouton "Historique" dans l'editeur visuel
- **Restaurer & Deployer** : restaure + deploie vers server 79 en un clic

### Tri des fichiers sections
- **Tri numerique** (pas alphabetique) : 10, 20, 30... 100 (pas 10, 100, 20)
- Le renommage lors de l'ajout de section utilise des noms temporaires pour eviter les ecrasements

### Cache
- **Fichiers admin JS/CSS** : `maxAge: 0` (pas de cache, changements frequents)
- **Site images** : `maxAge: 365d` (cache long + busting via `?v=timestamp`)

## Pages admin

| URL | Description |
|-----|-------------|
| `/` | Dashboard |
| `/pages.html` | Liste des pages (Editer, Code, Redir) |
| `/editor.html?slug=xxx` | Editeur visuel (iframe + toolbar) |
| `/page-code.html?slug=xxx` | Meta, OG, Schema, Sitemap, Perf, Historique |
| `/blocks.html` | Bibliotheque de blocs reutilisables |
| `/media.html` | Mediatheque |
| `/seo.html` | SEO global + injection de code |
| `/settings.html` | Parametres du site |
| `/security.html` | Securite, IP bans |
| `/deploy.html` | Deploiement Coolify |

## API principales

### Pages
- `GET /api/pages` — liste des pages
- `GET /api/pages/search?q=keyword` — recherche pages par titre + contenu (titre d'abord par pertinence, puis contenu par nombre d'occurrences)
- `GET /api/pages/:slug` — detail page + sections + SEO
- `GET /api/pages/:slug/preview` — preview HTML (optionalAuth, ?edit=1 pour editeur)
- `POST /api/pages/:slug/save` — sauvegarder modifications texte + SEO
- `POST /api/pages/:slug/add-section` — ajouter un bloc
- `DELETE /api/pages/:slug/delete-section` — supprimer un bloc
- `POST /api/pages/:slug/reorder-sections` — reordonner les sections (body: `{order: ["file1.html", ...]}`)
- `GET /api/pages/:slug/section/:file` — lire le code d'une section
- `PUT /api/pages/:slug/section/:file` — ecrire le code (avec nettoyage auto)
- `POST /api/pages/:slug/spacing` — sauvegarder l'espacement entre blocs
- `POST /api/pages/:slug/publish` — build + deploy
- `GET /api/pages/:slug/history` — liste des snapshots (avec reason, sections)
- `POST /api/pages/:slug/history/:id/restore` — restaurer un snapshot

### Formulaire de contact
- `POST /api/contact-form` — soumission publique (pas d'auth), envoie email via SMTP

### Blocs
- `GET /api/blocks` — liste de la bibliotheque
- `GET /api/blocks/:id` — contenu d'un bloc
- `POST /api/blocks` — sauvegarder un nouveau bloc
- `POST /api/blocks/from-section` — sauvegarder depuis une section existante
- `DELETE /api/blocks/:id` — supprimer un bloc

### SEO
- `GET /api/seo/global` — config SEO globale
- `GET /api/seo/scripts` — config injection de code
- `PUT /api/seo/scripts` — sauvegarder injection de code
- `GET /api/seo/sitemap` — generer sitemap XML dynamique
- `GET /api/seo/feed` — flux RSS 2.0 des articles blog

### Audit
- `GET /api/audit/global` — audit cross-pages (doublons, orphelines, incoherences)
- `GET /api/pages/:slug/seo-audit` — audit SEO par page (5 categories, score pondere)

### Shared (public, pas d'auth)
- `GET /api/shared/header` — HTML du header (pour integration WordPress)
- `GET /api/shared/footer` — HTML du footer
- `GET /api/shared/critical-css` — CSS critique (fonts + resets)

### Blog
- `GET /api/blog` — liste des articles
- `POST /api/blog/create` — creer un article (genere 3 fichiers : hero, body, related)
- `GET /api/blog/:slug` — detail article
- `PUT /api/blog/:slug` — modifier article
- `DELETE /api/blog/:slug` — supprimer article
- `POST /api/blog/categories` — ajouter une categorie

### Media
- `POST /api/media/upload` — upload images/videos (conversion WebP auto + 3 variantes responsive)

## Charte graphique Shootnbox

### Couleurs
- Rose : `#E51981` (variantes: #ff6eb4, #ff3fac, #c41470)
- Bleu : `#0250FF` (variante: #4d8aff)
- Violet : `#7828C8` (variantes: #a855f7, #c084fc)
- Orange : `#FF7A00` (variante: #ff9a3c)
- Vert : `#16A34A` (variante: #4ade80)
- Fond body : `#f8eaff` (bgAlt depuis site-config)
- Fonds sections : transparent, pas d'arrondis sur les wrappers

### Couleurs par borne
- Ring = orange, Vegas = rose, Miroir = bleu, Spinner = vert

### Typographie
- Police : Raleway (400-900, italic pour H1/H2)
- H1/H2 : 50px desktop, 28-32px mobile, weight 900, italic
- H3 : 28px, weight 700
- Body : 16px, weight 400

### Styles de cartes
- **Pastel (neumorphism)** : fond lilas degrade, double shadow (inset + outer), bordure neon coloree
- **Dark (produit)** : fond #1e1e2e, texte gradient colore, features rgba(couleur, 0.12)
- **Glassmorphism** : uniquement sur panels interieurs (PAS sur section wrappers)

### CTA
- Gradient rose, border-radius 50px, shine hover
- box-shadow: 0 6px 24px rgba(229,25,129,0.35)
- Hover: translateY(-3px), box-shadow amplifie

### Layout
- Max-width : 1300px centre
- Section padding : 60px 24px (standardise)
- Header : 72px desktop, 60px mobile

## Deploiement

### 1. Deployer une modification de code (GDS lui-meme)

```bash
# Commit + push vers GitHub
git add . && git commit -m "message" && git push origin master

# Trigger Coolify rebuild (server 217)
curl -s "http://217.182.89.133:8000/api/v1/deploy?uuid=usnz6o4qp48maw8q0lny22nl&force=true" \
  -H "Authorization: Bearer 1|FNcssp3CipkrPNVSQyv3IboYwGsP8sjPskoBG3ux98e5a576"
```

- Repo git : `https://github.com/AmazingeventParis/GestionnaireDeSite.git` (branche `master`)
- Coolify reconstruit l'image Docker depuis git — les **volumes Docker** (`gds-previews`, `gds-site-images`, etc.) persistent entre les redeploys
- Les fichiers locaux `previews/` ne sont PAS dans le volume Docker : modifier en local + trigger Coolify ne met pas a jour les previews sur server 217. Utiliser l'API `PUT /api/pages/:slug/section/:file` pour modifier les sections sur le serveur.

### 2. Publier une page GDS vers shootnbox.fr (server 79)

**Methode normale** : bouton **Deployer** sur `sites.swipego.app/pages.html`

Ce bouton appelle `POST /api/deploy/shootnbox/:slug` sur server 217, qui :
1. Recupere le HTML assemble de la page (`/api/pages/:slug/preview`)
2. Absolutise tous les assets locaux (`/images/`, `/fonts/`, `/css/`, `/js/`) en `https://sites.swipego.app/...`
3. Installe un `m.php` temporaire dans le dossier cible sur server 79 (via helper PHP passe par `/manager/m.php`)
4. Pousse le `index.html` dans ce dossier
5. Desactive `m.php` apres transfert

Le dossier cible est determine par `urlPath` ou `canonical` dans le SEO de la page GDS.

**Methode API directe** (si besoin de scripter) :
```bash
# 1. Login
TOKEN=$(curl -s -X POST "https://sites.swipego.app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shootnbox.fr","password":"Laurytal2"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))")

# 2. Deploy
curl -s -X POST "https://sites.swipego.app/api/deploy/shootnbox/SLUG" \
  -H "Authorization: Bearer $TOKEN" --max-time 60
```

**IMPORTANT — page `home`** : La page d'accueil (slug `home`, canonical `https://shootnbox.fr/`) deploie a la racine `/` (destPath vide). Bug corrige le 13/04/2026 (commit `42ea223`).

### 3. Reverter un deploiement vers server 79

Pour annuler une page deployee en statique (revenir a WordPress) :
1. Supprimer `index.html` dans le dossier cible via helper PHP
2. Supprimer le dossier vide (sinon Apache renvoie 403 au lieu de router vers WordPress)

```bash
# Ecrire helper de suppression dans /manager/
curl -s -X POST "https://shootnbox.fr/manager/m.php" \
  --data-urlencode "action=write" \
  --data-urlencode "file=helper_del.php" \
  --data-urlencode 'content=<?php
$dir = dirname(__DIR__) . "/SLUG";
if (file_exists($dir . "/index.html")) unlink($dir . "/index.html");
if (file_exists($dir . "/m.php")) unlink($dir . "/m.php");
if (is_dir($dir) && count(scandir($dir)) <= 2) { rmdir($dir); echo "REMOVED"; } else { echo "FILES_REMAIN"; }
?>'

# Executer
curl -s "https://shootnbox.fr/manager/helper_del.php"

# Nettoyer
curl -s -X POST "https://shootnbox.fr/manager/m.php" \
  --data-urlencode "action=write" \
  --data-urlencode "file=helper_del.php" \
  --data-urlencode "content=<?php http_response_code(404); ?>"
```

**NE JAMAIS supprimer des fichiers sur server 79 sans savoir ce qu'ils contiennent** — les pages statiques deja deployees sont les versions de production en cours.

## Systeme SEO

### Build.js — auto-corrections et validation
- **Mode warn/strict** : `BUILD_STRICT=strict` fait echouer le build si H1 manquant
- **H1 auto-promotion** : mode warn transforme premier H2 en H1 + log WARNING
- **Alt images** : utilise `media-meta.json` pour classification (decorative/informative/branding)
- **srcset responsive** : genere srcset reel si variantes -480w/-768w/-1280w existent sur disque
- **Validation SEO** : 14+ checks (title, description, H1, headings, alt, schema, OG, contenu, liens)
- **Score par categorie** : Indexation (30%), Contenu (25%), Performance (20%), Social (15%), Accessibilite (10%)
- **Sitemap auto** : genere sitemap.xml a chaque build

### Gardiens SEO
- **Au save** : retourne `seoWarnings[]` dans la reponse — la sauvegarde passe toujours
- **A la publication** : audit SEO complet, bloque si erreurs critiques (409 + `canForce:true`)
- **Front** : modal notification detaillee avec "OK compris" ou "Publier quand meme"

### Nomenclature des sections (site-config.json → sections)
- **hero** : height 520/420/360px, padding, titleSize 52/40/32px
- **standard** : padding 80/60/48px, titleSize 44/36/28px
- **compact** : padding 48/36/28px
- **cta** : padding 60/48/40px, maxWidth 860px
- **background** : enabled, gradient, glows, pictos
- Variables CSS injectees : `--hero-height`, `--section-padding`, `--section-title-size`, etc.
- Editables dans Settings → Sections

### Statuts editoriaux
- `draft` → `review` → `validated` → `published` → `archived`
- Gate SEO : review→validated necessite score >= 60
- `archived` auto-set noindex + retrait sitemap

## Blog

### Architecture des articles
- 3 fichiers generes : `10-blog-hero.html`, `20-blog-body.html`, `90-blog-related.html`
- CSS blog dans `public/css/blog-styles.css` (global, pas scope)
- Sidebar injectee par le preview route pour les pages `blog-*`
- TOC auto-genere depuis les H2 du contenu
- L'utilisateur ajoute ses blocs entre le hero et les related via l'editeur

### Sidebar blog
- Injectee automatiquement par le serveur (pas un fichier)
- TOC : uniquement les H2 (pas H3), pas de doublons
- CTA : Location photobooth 299€ (fige)
- Articles lies : depuis blog-index
- Layout : grid 2 colonnes (1fr 280px), sidebar sticky, responsive 1col mobile

## Editeur visuel

### Barre admin
- Boutons : **SEO**, **Historique** (backup/restore), **Publier**, **Deconnexion**
- Selecteur de page (dropdown)
- Compteur de modifications en attente

### Toolbar de texte (WYSIWYG)
- **H1-H4, P** : change le type de balise (sauvegarde persistee)
- **B, I, U, S** : gras, italique, souligne, barre (via execCommand, toggle)
- **Lien** : modal avec recherche autocomplete (pages par titre puis contenu, classees par pertinence) + options nofollow et nouvel onglet
- **Supprimer lien** : unlink
- **Clear** : supprimer la mise en forme
- **`</>`** : editeur HTML source (modal avec textarea monospace)
- **Undo** : bouton ↶ + Ctrl+Z global (stack 50 niveaux, snapshot au focus + avant changeTag)
- Tous les styles avec `!important` pour resister au CSS des blocs
- **Toolbar inside l'element** avec mousedown+preventDefault pour garder le focus
- **Blur retarde 80ms** + flag `_toolbarActive` pour eviter la perte de selection sur les boutons
- **Paste force en texte brut** (insertText) pour preserver les styles existants
- **Gradient text** : CSS `contenteditable` override `-webkit-text-fill-color` en couleur lisible pendant l'edition

### Badges Hn colores
- H1 = rose `#E51981`, H2 = bleu `#0250FF`, H3 = violet `#7828C8`, H4 = orange `#FF7A00`, P = gris discret
- Badge `::after` avec `data-gds-tag` sur chaque element editable
- Visibles en permanence dans l'editeur

### Sidebar flottante (sections + plan Hn)
- Bouton hamburger en bas a gauche pour ouvrir/fermer (largeur 300px)
- **Onglet Sections** : pastilles numerotees, drag & drop pour reordonner (appelle `POST /reorder-sections`), clic pour scroller, section active surlignee en rose
- **Onglet Plan Hn** : vue hierarchique de tous les H1-H4 de la page, indentes par niveau, memes couleurs que les badges, clic pour scroller + flash highlight
- Texte des Hn nettoye (exclut le contenu de `.gds-tag-select`)

### Link picker (bouton lien)
- Modal avec champ de recherche
- Tape une URL complete (interne ou externe) : insertion directe
- Tape des mots-cles : recherche serveur `GET /api/pages/search?q=...`
  - Pages avec le mot dans le titre (classees par pertinence : slug exact > debut > contient)
  - Pages avec le mot dans le contenu (classees par nombre d'occurrences)
  - Affichage en 2 groupes : "Pages — titre" (rose) et "Pages — contenu" (gris)
- Checkbox **"Ouvrir dans un nouvel onglet"** → `target="_blank" rel="noopener noreferrer"`
- Checkbox **"nofollow"** → `rel="nofollow"` (ne pas transmettre le jus SEO)
- Attributs `rel` et `target` preserves par le nettoyage serveur

### Double-clic sur image
- Modal avec preview + nom du fichier
- Champs **alt** et **titre** editables directement (pre-remplis)
- Section **"Remplacer le fichier"** (optionnel) : upload ou URL
- Enregistrer sans changer le fichier = sauvegarde alt/title uniquement
- Toolbar flottante (Changer/Position/Miroir) masquee pendant la modal
- Section auto-sauvegardee apres modification

### Labels de section
- Bandeau permanent en haut de chaque section avec nom du fichier
- Boutons : code (`</>`), bibliotheque, supprimer
- Toujours visible, fond sombre

### Detection des elements editables
- Selecteur elargi : h1-h6, p, li, blockquote, figcaption, [class*="snb-h"], [class*="snb-title"], etc.
- Elements exclus : sidebar, toc, breadcrumb, nav, script, style
- `editMode = req.query.edit === '1'` (pas de check auth dans l'iframe)
- Save via cheerio : match par index global dans la section
- `setupEditable()` : fonction unique partagee entre init et reinit (apres changeTag)

### Nettoyage auto au save
- Supprime `<!DOCTYPE>`, `<html>`, `<head>` (garde `<style>`), `<body>`
- Supprime resets `* { margin:0!important; padding:0!important }`
- Supprime toolbar tag-select du innerHTML avant sauvegarde (`getCleanHTML()`)
- Neutralise `.snb-header` herite du header du site dans les sections

### Placeholders images
- `<img data-gds-placeholder>` : wrappee dans div pour overlay
- Upload ou URL → `src` mis directement sur l'img
- Section sauvegardee automatiquement apres upload

## Fond de page global
- Fichier : `previews/_shared/page-background.html` + `public/css/blog-styles.css`
- Degrade : #f8eaff → #fff0f8 → #FFF8EE → #f0f0ff → #f8eaff
- 6 halos diffus animes (rose, bleu, violet, orange, vert)
- 12 pictos SVG decoratifs (polaroids, appareils photo, etoiles, coeurs, confettis)
- Configurable dans Settings → Sections → Fond de page
- `overflow-x: clip` sur body et page-wrapper (pas hidden — casse sticky)

## Regles pour les developpeurs de blocs

### Format de livraison
```html
<style>.mon-bloc { ... }</style>
<section class="mon-bloc">...</section>
```
- PAS de `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`
- PAS de reset `* { margin:0!important }`
- PAS de classes `.snb-header`, `.snb-footer`, `.snb-nav` (conflit avec le systeme)
- Toutes les regles CSS scopees sous la classe du bloc
- Utiliser de vrais `<h2>`, `<h3>` (pas `<div class="snb-h2">`)
- Images placeholder : `<img src="" alt="..." data-gds-placeholder>`

### Variables CSS disponibles
```css
var(--hero-height)        /* 520px → 420px → 360px */
var(--hero-padding)       /* responsive */
var(--hero-title-size)    /* 52px → 40px → 32px */
var(--section-padding)    /* 80px 24px → 48px 16px */
var(--section-title-size) /* 44px → 28px */
var(--color-primary)      /* #E51981 */
var(--color-secondary)    /* #0250FF */
var(--max-width)          /* 1300px */
```

## Formulaire de contact (shootnbox.fr/contacts)

### Architecture
- **Section HTML** : `previews/contacts/20-section.html` (formulaire + sidebar infos)
- **Route backend** : `routes/contact-form.js` → `POST /api/contact-form` (public, pas d'auth)
- **SMTP** : Nodemailer via `smtp.office365.com:587` (STARTTLS), compte `contact@shootnbox.fr`
- **Variables env Coolify** : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_EMAIL`
- **CORS** : `shootnbox.fr` et `www.shootnbox.fr` ajoutes dans `server.js`
- **Body parser** : `express.urlencoded()` ajoute pour le POST natif (fallback sans JS)

### Champs du formulaire
- `nom` (required), `societe`, `email` (required), `telephone`, `type_evenement` (required), `date_evenement`, `ville`, `message`

### Email envoye
- Template identique a la notification admin de `send-mail.php` (mode `devis-admin`)
- Bandeau orange `#FF7A00`, carte prospect avec avatar initiales rose, pills contact, cartes colorees (type/date/ville), bloc message orange, boutons Repondre + Appeler
- Sujet : `Demande de contact - [Nom] - [Type] - [JJ/MM/AAAA]`
- `replyTo` = email du prospect, `from` = `contact@shootnbox.fr`
- Charset UTF-8 force (`Content-Type` meta + `encoding: 'utf-8'` Nodemailer)

### Anti-spam (4 couches invisibles)
1. **Honeypot** : champ `_honey` cache, rejet silencieux si rempli
2. **JS proof** : champ `_returnUrl` injecte par JS au chargement — bots qui POST directement n'ont pas ce champ
3. **Time trap** : champ `_t` = timestamp au chargement, rejet si soumission < 3 secondes
4. **Filtre contenu** : rejet cyrillique/CJK, mots-cles spam (casino, viagra, crypto...), 3+ URLs
- Tous les rejets retournent `{"ok":true}` (le bot ne sait pas qu'il est bloque)
- Rate limit : 5 soumissions / 15 minutes par IP

### Apres soumission
- **POST AJAX** (JS actif) : reponse JSON `{"ok":true}`, formulaire remplace par message de confirmation
- **POST natif** (JS inactif) : redirect vers `?sent=1`, script detecte le param et affiche message vert "Votre demande a bien ete envoyee !"
- Le champ `_returnUrl` sert a rediriger vers la bonne page (Referer non envoye en cross-origin)

## Blog WordPress

### Template article custom
- Fichiers dans `docs/wp-template/` (supprimes du working tree, recuperables dans git : commits `489ac3e` et `2d778e5`)
- `single.php` : template PHP article, classes `snb-*`, meme design que le site GDS
- `snb-blog.css` : copie de `blog-styles.css`, charte Raleway/couleurs Shootnbox
- `snb-toc.js` : sommaire dynamique (TOC) depuis les H2 + scroll actif
- `functions-snippet.php` : charge CSS/JS/Raleway dans le theme enfant

### Configuration WordPress
- **Elementor desactive sur les Articles** : WP Admin → Elementor → Parametres → General → Types de contenu → decocher "Articles"
- Les articles se modifient dans **Gutenberg** (editeur classique WordPress), pas Elementor
- Le design est rendu par `single.php` + `snb-blog.css` (pas par Elementor)
- Elementor reste actif uniquement pour les Pages WordPress

### Badges categories
- Mapping automatique slug → badge colore : mariage=rose, entreprise=bleu, anniversaire=violet, conseils=orange
- Auteur : photo Gravatar avec fallback initiales

## Bannieres promotionnelles

### Architecture
- **Stockage** : `previews/_shared/banners/{id}.json` (dans le volume Docker `gds-previews`, persiste entre les deploys)
- **Route backend** : `routes/banners.js` — CRUD + endpoints publics
- **Page admin** : `public/banners.html` (onglet "Bannieres" dans la nav)
- **Injection** : via script client dans le header partage (fetch `/api/banners/active`)
- **Pas de cron** : verification de date a chaque requete, cache 5min sur endpoints publics

### API

| Methode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/api/banners` | verifyToken | Liste toutes les bannieres |
| GET | `/api/banners/:id` | verifyToken | Detail d'une banniere |
| POST | `/api/banners` | admin/editor | Creer une banniere |
| PUT | `/api/banners/:id` | admin/editor | Modifier une banniere |
| DELETE | `/api/banners/:id` | admin | Supprimer une banniere |
| GET | `/api/banners/active` | **public** | HTML+CSS+JS de la banniere active (CORS, cache 5min) |
| GET | `/api/banners/active.js` | **public** | Script loader JS pour WordPress |
| GET | `/api/shared/banner` | **public** | Alias dans shared.js (meme pattern que header/footer) |

### Donnees d'une banniere (JSON)
- `name`, `html` (contenu — texte simple OU bloc HTML complet avec `<style>`+`<script>`), `css`
- `textColor`, `startDate`, `endDate`, `priority`, `closable`, `enabled`
- `createdAt`, `createdBy`, `updatedAt`

### Planification
- Champs `startDate` + `endDate` (date picker dans l'admin)
- Seule la banniere active avec la plus haute `priority` est affichee
- Statuts calcules : Active (vert), Programmee (jaune), Expiree (gris), Desactivee (rouge)
- Toggle activer/desactiver directement sur la carte (sans ouvrir le formulaire)

### Affichage responsive
- **Desktop** : banniere en haut, premier enfant de `<main class="snb-page-content">`, pleine largeur
- **Mobile (< 850px)** : `position:fixed!important;bottom:0` (sticky en bas, suit le scroll)
- Fond transparent par defaut (pas de bgColor)
- Fermable (croix) avec `sessionStorage` pour ne pas reafficher dans la session

### Types de contenu
- **Texte simple** : wrapper `.snb-promo-banner__inner` avec flex center
- **Bloc HTML complet** (detecte par presence de `<style>` ou `<div class=`) : injecte tel quel dans le wrapper, sans styles par defaut — permet les animations, tickers, designs custom

### Injection dans les pages
- **Script client dans le header partage** (`previews/_shared/header.html`) : fetch `/api/banners/active`, injecte dans `.snb-page-content`, recree les `<script>` pour les executer
- Fonctionne sur toutes les pages GDS (preview + deployees) et WordPress (via le header partage)
- `insertAdjacentHTML` n'execute pas les scripts → le loader les recree via `document.createElement('script')`

### WordPress
- Script loader deployé sur server 79 : `/manager/snb-banner-loader.js`
- Helper PHP : `/manager/snb-banner-inject.php` (a inclure dans `functions.php`)
- Ou directement via le header partage qui contient le loader

### Page admin (banners.html)
- Dark theme, grille de cartes avec badge statut + toggle on/off
- Formulaire : nom, contenu HTML (textarea code), CSS custom, couleur texte, dates (date picker), priorite, fermable, apercu live
- Les textareas sont remplies via `.value` apres insertion DOM (evite que le HTML casse le template JS)

### Build.js — iframes lazy-load
- Tous les `<iframe>` (YouTube, Google Maps, etc.) recoivent `loading="lazy"` automatiquement au build
- Empeche le chargement du player YouTube (~800KB JS) tant que le visiteur ne scroll pas

## Bugs resolus importants

- **Sections disparaissant au deploy** : Volumes Docker non montes → corrige avec docker-compose build pack
- **CSS casse entre sections** : Scoping CSS avec parser brace-matching + strip @import
- **Placeholder overlay invisible** : z-index 50, detection par dashed border + [class*="placeholder"]
- **Fichiers ecrases au renommage** : Renommage en 2 passes (temp → final)
- **Tri alphabetique des sections** : 10, 100, 20 → corrige en tri numerique
- **Cache navigateur** : maxAge 0 sur fichiers admin
- **Scripts FAQ non executes** : Extraction des scripts des sections standalone → reinjectes en fin de body
- **Contamination admin dans les fichiers** : Nettoyage serveur dans PUT /section/:file
- **Build ne chargeait pas les sections** : fichiers `02-hero.html` non trouves car build cherchait `hero.html` → fix avec scan par nom sans prefixe
- **Sidebar blog non visible** : `overflow-x:hidden` sur body cassait `position:sticky` → remplace par `overflow-x:clip`
- **Media queries cassees par scopeCSS** : regles fuyaient hors des `@media` → fix avec injection explicite des regles layout/sidebar
- **Elements non editables dans l'editeur** : `editMode` necessitait auth mais iframe sans cookie → fix `editMode = req.query.edit === '1'`
- **Save ne persistait pas** : index global vs index par tag → fix avec cheerio match par index global
- **Toolbar BIUS dans le HTML sauve** : regex ne matchait pas la barre complete → fix avec remove/reappend DOM
- **Boutons section invisibles** : position absolute dans wrapper avec overflow:hidden → fix avec labels permanents en haut de section
- **Bold/Italic toggle ne marchait pas** : toolbar en sibling causait blur avant execCommand → toolbar remise inside + mousedown preventDefault + blur retarde 80ms avec flag `_toolbarActive`
- **Texte gradient invisible au clic** : elements avec `background-clip:text` + `-webkit-text-fill-color:transparent` deviennent blancs quand contenteditable s'active → CSS override force couleur lisible `#2d1b4e` pendant l'edition
- **Paste casse la mise en page** : collage HTML riche ecrase les styles existants → force paste en texte brut via `insertText`
- **Plan Hn pollue par la toolbar** : `textContent` des headings incluait les boutons H1H2H3H4PBIUS → clone + remove `.gds-tag-select` avant lecture
- **Formulaire contact redirige vers la home** : Referer non envoye en POST cross-origin → champ `_returnUrl` injecte par JS
- **Formulaire contact "Route non trouvee"** : POST natif en `urlencoded` mais serveur n'avait que `express.json()` → ajout `express.urlencoded()`
- **Email accents casses** : "déménage" → "d�m�nage" → ajout `Content-Type: text/html; charset=utf-8` + `encoding: 'utf-8'` Nodemailer
- **Spam russe sur formulaire contact** : bots POST direct → 4 couches anti-spam invisibles (honeypot, JS proof, time trap, filtre contenu)
- **Elementor ne charge pas les articles** : `single.php` du theme enfant court-circuite Elementor → desactiver Elementor sur les Articles dans les parametres
- **Banniere invisible derriere header fixe** : injectee `afterend` du header (`position:fixed;z-index:9999`), masquee en dessous → injectee dans `<main>` (premier enfant) qui a deja le `padding-top:72px`
- **Banniere doublon** : injectee cote serveur (pages.js) ET cote client (header loader) → supprime l'injection serveur, garde uniquement le loader client
- **Banniere mobile en haut au lieu du bas** : `style="position:relative"` inline ecrasait `position:fixed` de la media query → ajoute `!important` sur les proprietes mobile
- **Banniere sans texte (ticker)** : `insertAdjacentHTML` n'execute pas les `<script>` → le loader recree les scripts via `document.createElement('script')`
- **Bannieres perdues au redeploy** : stockees dans `banners/` (volume Docker non persiste) → deplacees dans `previews/_shared/banners/` (volume `gds-previews` persiste)
- **Bouton Enregistrer banniere ne marchait pas** : HTML complexe de la banniere (avec `<style>`/`<script>`) cassait le template string JS du formulaire → textareas remplies via `.value` apres insertion DOM
- **Header ecrase par rebuild** : fichier local `previews/_shared/header.html` ancien a ecrase la version serveur → restaure depuis git commit `8eee946` (version avec mega-menu dropdowns)

## Sauvegardes

### Backup avant audit GEO (17/04/2026)
- **Fichier** : `backup-2026-04-17T09-48-24-283Z.zip`
- **ID Supabase** : `ac89dac5-c6ed-4295-8fad-421dfbbe00c7`
- **Taille** : 30.87 MB (previews/ + site-config.json)
- **Stockage** : volume Docker `gds-backups` sur serveur 217
- **Restaurer** : `POST /api/backups/ac89dac5-c6ed-4295-8fad-421dfbbe00c7/restore`
- **Contexte** : etat du site avant les modifications de l'audit GEO (JSON-LD, OG, redirections, corrections HTML)
