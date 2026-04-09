# Gestionnaire de Site — Shootnbox

## Google Places API — Bloc avis dynamique (FAIT — 08/04/2026)

- **Place IDs configurés** dans `.env` :
  - Paris : `ChIJxSIRRC5x5kcRX2Elmh-CeRI` (Montreuil)
  - Bordeaux : `ChIJ7Y3spjRvU0UR8IC-gF3tZJE` (Bègles)
- **Résultat** : 4.8★, 1361 avis totaux, 5 avis retenus après filtre qualité
- **Filtre** : 5★ ≥ 60 chars, 4★ ≥ 120 chars (max 2), triés par date
- **Bloc créé** : `previews/_shared/block-reviews-marquee.html` (dark marquee défilant)
- **Route** : `routes/reviews.js` — GET /api/reviews, cache 24h
- **Remplacement** : Ancien bloc `snb-avis` remplacé sur toutes les pages locales et villes (via API)
- **Script de découverte** : `scripts/find-place-ids.js`

## Google Business Profile API — Réponse automatique aux avis

- **Demande d'accès GBP API envoyée le 07/04/2026** (délai réponse : 2-5 jours ouvrés)
- **Project ID** : `362425146347`
- **OAuth credentials** configurés dans `.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- **APIs activées** : My Business Account Management API, My Business Business Information API
- **Scope** : `https://www.googleapis.com/auth/business.manage`
- **Scripts prêts** : `scripts/google-oauth-setup.js`, `scripts/google-business-ids.js`
- **À faire dès approbation** : lancer `node scripts/google-business-ids.js` pour récupérer `GOOGLE_ACCOUNT_NAME` et `GOOGLE_LOCATION_NAME`, puis construire table Supabase + UI admin réponses

## Header — Menus déroulants (FAIT — 08/04/2026)

- **Fichier** : `previews/_shared/header.html`
- **Onglet Location** : converti en dropdown avec 5 items :
  - 📸 Location Photobooth → `/location-photobooth/`
  - 🏭 Location Photobooth Entreprises → `/location-photobooth-entreprises/`
  - 💍 Location Photobooth Mariage → `/location-photobooth-mariage/`
  - 🎂 Location Photobooth Anniversaire → `/location-photobooth-anniversaire/`
  - 🧱 Location Photocall → `/location-photocall/`
- **Onglet Nos bornes** : 3 nouvelles bornes ajoutées (emojis placeholder, photos à venir) :
  - 🎥 AirCam 360 © → `/borne-aircam-360/`
  - 👗 Fashion Box → `/location-fashion-box/`
  - 🎤 Karaoké → `/location-karaoke/`
- **Mobile** : sous-menus Location + 3 nouvelles bornes ajoutés
- **À faire** : remplacer les emojis placeholders par les vraies photos des bornes

## Déploiement pages GDS → shootnbox.fr (production) — 09/04/2026

### Stratégie retenue : déploiement statique sur serveur 79 (shootnbox.fr)

Les pages créées dans GDS (sites.swipego.app) sont exportées en HTML statique et déposées sur le serveur Apache/WordPress shootnbox.fr via un script Python. Les assets (images, fonts, CSS) restent servis par GDS (sites.swipego.app), les URLs sont absolutisées au moment de l'export.

**Pourquoi pas héberger directement sur server 217 ?**  
Le domaine shootnbox.fr pointe encore vers server 79. Rediriger le DNS vers 217 = migrer tout le site. On déploie d'abord page par page en statique sur 79, puis on bascule le DNS quand toutes les pages seront prêtes.

### Script de déploiement Python (à rejouer pour chaque nouvelle page)

```python
import re, requests, tempfile, os

BASE_GDS = 'https://sites.swipego.app'
SLUG = 'athis-mons'
DEST_DIR = f'/location-photobooth-{SLUG}'   # répertoire sur shootnbox.fr

# 1. Fetch HTML depuis GDS
html = requests.get(f'{BASE_GDS}/api/pages/{SLUG}/preview').text

# 2. Absolutiser toutes les URLs relatives d'assets
def absolutize(m):
    attr, url = m.group(1), m.group(2)
    if url.startswith('http') or url.startswith('//'):
        return m.group(0)
    if url.startswith(('/fonts/', '/images/', '/site-images/', '/css/', '/js/')):
        return f'{attr}="{BASE_GDS}{url}"'
    return m.group(0)

html = re.sub(r'(href|src)="([^"]*)"', absolutize, html)

# Absolutiser les CSS url() (fonts dans @font-face)
html = re.sub(r"url\('(/(?:fonts|images|site-images)/[^']+)'\)",
              lambda m: f"url('{BASE_GDS}{m.group(1)}')", html)
html = re.sub(r'url\("(/(?:fonts|images|site-images)/[^"]+)"\)',
              lambda m: f'url("{BASE_GDS}{m.group(1)}")', html)

# Absolutiser fetch() API (ex: avis Google)
html = html.replace("fetch('/api/", f"fetch('{BASE_GDS}/api/")

# 3. Déposer via m.php sur shootnbox.fr (voir section déploiement m.php)
```

### Absolutisation — règles complètes

| Pattern | Traitement |
|---------|------------|
| `href="/css/..."`, `src="/images/..."`, `src="/site-images/..."`, `src="/fonts/..."`, `href="/js/..."` | → absolute `https://sites.swipego.app/...` |
| `fetch('/api/...')` | → `fetch('https://sites.swipego.app/api/...')` |
| `url('/fonts/...')` dans CSS inline | → absolute (pattern séparé) |
| Liens internes entre pages (`href="/mentions-legales/"` etc.) | **laisser relatifs** |

### Modifications techniques réalisées dans GDS

#### 1. `server.js` — Routage interne sans redirection HTTP

**Problème** : Le router `/location-photobooth-:city/` faisait un `res.redirect()` vers `/api/pages/:slug/preview`, changeant l'URL dans le navigateur (mauvais SEO + canonical incorrect).

**Fix** : Forward interne — mutation de `req.url` + appel direct du router pages.

```javascript
let pagesRouter;
try { pagesRouter = require('./routes/pages'); app.use('/api/pages', pagesRouter); } catch {}

function servePageBySlug(slug, req, res, next) {
  if (!pagesRouter) return next();
  req.url = '/' + slug + '/preview';
  req.params = {};
  pagesRouter(req, res, next);
}

app.get('/location-photobooth-:city/', (req, res, next) => {
  servePageBySlug(req.params.city.replace(/[^a-z0-9-]/gi, ''), req, res, next);
});
app.get('/location-photobooth/:city/', (req, res, next) => {
  servePageBySlug(req.params.city.replace(/[^a-z0-9-]/gi, ''), req, res, next);
});
```

Le routage dynamique général (toutes pages par slug/urlPath) utilise aussi `servePageBySlug()`.

#### 2. `server.js` — CORS + CORP sur les assets publics

**Problème 1** : Fonts `@font-face` bloquées cross-origin (fetch nécessite CORS).  
**Problème 2** : Helmet applique `Cross-Origin-Resource-Policy: same-origin` par défaut → **toutes les images bloquées** depuis shootnbox.fr avec `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.

**Diagnostic** : Chrome DevTools MCP → `list_network_requests` filtré `image` → erreur CORP sur toutes les images GDS sauf l'image hero (URL externe toploc.com).

**Fix** : Surcharger les deux headers sur les routes d'assets après Helmet dans le pipeline :

```javascript
app.use('/fonts',      (req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); });
app.use('/images',     (req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); });
app.use('/site-images',(req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); });
```

Ces middlewares sont déclarés **après** `app.use(securityHeaders)`. Express évalue dans l'ordre de déclaration, donc `res.setHeader()` ici écrase la valeur Helmet pour ces routes.

**Piège** : Le premier deploy avait bien inclus le fix mais le commit n'avait pas été pushé → Coolify déployait l'ancien code. Toujours vérifier `git push` avant de déclencher un deploy Coolify.

#### 3. `routes/reviews.js` — CORS sur l'API avis

```javascript
router.get('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
```

Nécessaire pour que `fetch('https://sites.swipego.app/api/reviews')` fonctionne depuis shootnbox.fr.

#### 4. `routes/pages.js` — Injection canonical + robots dans le `<head>`

```javascript
${seo.canonical ? `  <link rel="canonical" href="${seo.canonical}">` : ''}
${seo.noindex  ? `  <meta name="robots" content="noindex,nofollow">` : ''}
```

Canonical défini dans `previews/athis-mons/seo.json` :
```json
{ "canonical": "https://shootnbox.fr/location-photobooth-athis-mons/" }
```

#### 5. `previews/_shared/header.html` — Liens pages non encore migrées

| Lien | Avant | Après |
|------|-------|-------|
| Location Photocall (dropdown) | `/location-photocall/` | `https://shootnbox.fr/location-photocall/` |
| Contact | `/contact/` | `https://shootnbox.fr/contacts/` |
| Blog | `/blog/` | `https://shootnbox.fr/blog/` |
| (mobile : même 3 liens) | idem | idem |

#### 6. `previews/_shared/footer.html` — Liens corrigés

| Lien | Avant | Après |
|------|-------|-------|
| Blog | `/blog/` | `https://shootnbox.fr/blog/` |
| Contact | `/contact/` | `https://shootnbox.fr/contacts/` |
| CGV | `/conditions-generales-de-ventes/` (inexistant) | `/conditions-generales-de-location/` |
| Libellé CGV | `CGV` | `Conditions generales de Location` |

### Pages légales créées dans GDS (09/04/2026)

| Page | Slug | URL |
|------|------|-----|
| Politique de confidentialité | `politique-de-confidentialite` | `/politique-de-confidentialite/` |
| Mentions légales | `mentions-legales` | `/mentions-legales/` |
| Conditions générales de Location | `conditions-generales-de-location` | `/conditions-generales-de-location/` |

### Résultat final — page athis-mons

- URL prod : `https://shootnbox.fr/location-photobooth-athis-mons/`
- HTML statique déployé sur server 79 via m.php (172 968 bytes)
- Assets servis depuis `https://sites.swipego.app` (CORS + CORP configurés)
- Toutes images 200 OK (vérifié Chrome DevTools MCP)
- Canonical : `https://shootnbox.fr/location-photobooth-athis-mons/`

### Checklist pour déployer une nouvelle page ville

1. Finaliser la page dans GDS
2. Définir `canonical` dans son `seo.json` : `https://shootnbox.fr/location-photobooth-{ville}/`
3. Lancer le script Python (absolutiser + upload via m.php)
4. Vérifier : images, fonts, avis, liens header/footer

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

### Historique / Versions
- Snapshot automatique avant chaque sauvegarde (30 derniers gardes)
- Stockes dans `.history/` par page
- Restauration via API + UI dans page-code.html

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
- `GET /api/pages/:slug` — detail page + sections + SEO
- `GET /api/pages/:slug/preview` — preview HTML (optionalAuth, ?edit=1 pour editeur)
- `POST /api/pages/:slug/save` — sauvegarder modifications texte + SEO
- `POST /api/pages/:slug/add-section` — ajouter un bloc
- `DELETE /api/pages/:slug/delete-section` — supprimer un bloc
- `GET /api/pages/:slug/section/:file` — lire le code d'une section
- `PUT /api/pages/:slug/section/:file` — ecrire le code (avec nettoyage auto)
- `POST /api/pages/:slug/spacing` — sauvegarder l'espacement entre blocs
- `POST /api/pages/:slug/publish` — build + deploy
- `GET /api/pages/:slug/history` — liste des snapshots
- `POST /api/pages/:slug/history/:id/restore` — restaurer un snapshot

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

```bash
# Build les pages publiees
node scripts/build.js

# Commit + push
git add . && git commit -m "message" && git push origin master

# Deploy via Coolify API
curl -s "http://217.182.89.133:8000/api/v1/deploy?uuid=usnz6o4qp48maw8q0lny22nl&force=true" \
  -H "Authorization: Bearer 1|FNcssp3CipkrPNVSQyv3IboYwGsP8sjPskoBG3ux98e5a576"
```

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

### Toolbar de texte
- **H1-H4, P** : change le type de balise (sauvegarde persistee)
- **B, I, U, S** : gras, italique, souligne, barre (via execCommand)
- **Lien** : inserer/supprimer un lien
- **Clear** : supprimer la mise en forme
- **`</>`** : editeur HTML source (modal avec textarea monospace)
- Tous les styles avec `!important` pour resister au CSS des blocs

### Labels de section
- Bandeau permanent en haut de chaque section avec nom du fichier
- Boutons : code (`</>`), bibliotheque, supprimer
- Toujours visible, fond sombre

### Detection des elements editables
- Selecteur elargi : h1-h6, p, li, blockquote, figcaption, [class*="snb-h"], [class*="snb-title"], etc.
- Elements exclus : sidebar, toc, breadcrumb, nav, script, style
- `editMode = req.query.edit === '1'` (pas de check auth dans l'iframe)
- Save via cheerio : match par index global dans la section

### Nettoyage auto au save
- Supprime `<!DOCTYPE>`, `<html>`, `<head>` (garde `<style>`), `<body>`
- Supprime resets `* { margin:0!important; padding:0!important }`
- Supprime toolbar tag-select du innerHTML avant sauvegarde
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
- **Elementor widget hors wrapper** : widget HTML custom fermait le widget-wrap avec trop de </div> → widgets devenaient flex siblings → fix global `flex-direction:column!important` sur `.elementor-top-column`
- **Grid colonne expansee** : `min-width:auto` sur item grid → fix `min-width:0` sur `.snb-article-body-col`
- **snb-header fixe dans sections** : `.snb-header` dans une section herite `position:fixed` du vrai header → fix override `.gds-section-wrapper .snb-header { position:static!important }`
- **Hero gradient non applique (vegas)** : `lp-hero-bg-overlay` etait `display:none` + classe differente de `lph-bg-overlay` → fix global ciblant les 3 variantes avec `display:block!important`

## Pages villes — Classement par departement (172 villes, avril 2026)

Toutes en statut `draft`. Objectif : creer des images hero par departement plutot que par ville.

### Priorite images (4 images = 73% des pages)

| Dept | Image a creer | Nb villes |
|------|--------------|-----------|
| **92** Hauts-de-Seine | banlieue ouest Paris | 29 |
| **93** Seine-Saint-Denis | banlieue nord/est Paris | 32 |
| **94** Val-de-Marne | banlieue sud/est Paris | 33 |
| **33** Gironde | Bordeaux + agglo | 32 |
| **95** Val-d'Oise | banlieue nord Paris | 8 |
| **78** Yvelines | banlieue ouest Paris | 7 |
| **77** Seine-et-Marne | est Paris | 6 |
| **91** Essonne | sud Paris | 5 |
| Grandes villes | 1 image generique ou par ville | 18 |

### Villes par departement

**92 — Hauts-de-Seine (29)** : antony, bagneux, boulogne, bourg-la-reine, chatenay-malabry, chatillon, chaville, clamart, clichy, colombes, courbevoie, fontenay-aux-roses, garches, gennevilliers, issy-les-moulineaux, la-garenne-colombes, levallois-perret, malakoff, meudon, montrouge, nanterre, neuilly-sur-seine, puteaux, rueil-malmaison, saint-cloud, sceaux, sevres, suresnes, vanves

**93 — Seine-Saint-Denis (32)** : aubervilliers, aulnay-sous-bois, bagnolet, bobigny, bondy, clichy-sous-bois, drancy, epinay-sur-seine, gagny, la-courneuve, le-blanc-mesnil, le-pre-saint-gervais, les-lilas, les-pavillons-sous-bois, livry-gargan, montfermeil, montreuil, neuilly-plaisance, neuilly-sur-marne, noisy-le-grand, noisy-le-sec, pantin, pierrefitte-sur-seine, romainville, rosny-sous-bois, saint-denis, saint-ouen, sevran, stains, tremblay-en-france, villemomble, villepinte

**94 — Val-de-Marne (33)** : alfortville, arcueil, bonneuil-sur-marne, bry-sur-marne, cachan, champigny-sur-marne, charenton-le-pont, chennevieres-sur-marne, chevilly-larue, choisy-le-roi, creteil, fontenay-sous-bois, fresnes, gentilly, ivry-sur-seine, joinville-le-pont, kremlin-bicetre, l-hay-les-roses, le-perreux-sur-marne, le-plessis-robinson, le-plessis-trevise, maison-alfort, nogent-sur-marne, orly, rungis, saint-mande, saint-maur-des-fosses, sucy-en-brie, thiais, villejuif, villiers-sur-marne, vincennes, vitry-sur-seine

**33 — Gironde (32)** : andernos-les-bains, arcachon, audenge, begles, biganos, blanquefort, bordeaux, bruges, cenon, cestas, eysines, floirac, gradignan, gujan-mestras, la-teste-de-buch, lacanau, le-bouscat, le-haillan, le-taillan-medoc, le-teich, lege-cap-ferret, leognan, libourne, lormont, merignac, mios, parempuyre, pessac, saint-loubes, saint-medard-en-jalles, talence, villenave-d-ornon

**95 — Val-d'Oise (8)** : argenteuil, bezons, cergy, deuil-la-barre, garges-les-gonesse, gonesse, herblay, sarcelles

**78 — Yvelines (7)** : mantes-la-jolie, montigny-le-bretonneux, plaisir, poissy, saint-germain-en-laye, sartrouville, versailles

**77 — Seine-et-Marne (6)** : champs-sur-marne, chelles, meaux, melun, pontault-combault, torcy

**91 — Essonne (5)** : athis-mons, corbeil-essonne, evry, massy, palaiseau

**Grandes villes isolees** : aix-en-provence + marseille (13), caen (14), nice (06), nimes (30), toulouse (31), montpellier (34), rennes (35), angers (49), reims (51), lille (59), clermont-ferrand (63), strasbourg (67), lyon (69), rouen (76), dijon (21), tours (37), nantes (44)

### Progression
- [x] Image 94 Val-de-Marne → `/site-images/valdemarne94-1775202601224.webp`
- [x] Image 93 Seine-Saint-Denis → `/site-images/seinesaintdenis93-1775202599298.webp`
- [x] Image 33 Gironde → `/site-images/gironde33-1775202595710.webp`
- [x] Image 92 Hauts-de-Seine → `/site-images/hautsdeseine92-1775202597298.webp`
- [ ] Image 95 Val-d'Oise
- [ ] Image 78 Yvelines
- [ ] Image 77 Seine-et-Marne
- [ ] Image 91 Essonne
- [ ] Image grandes villes
- [ ] Publication des 172 pages villes

