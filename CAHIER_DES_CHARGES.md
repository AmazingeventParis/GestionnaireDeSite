# Cahier des Charges — Gestionnaire de Site

> **Version** : 1.0
> **Date** : 18 mars 2026
> **Projet** : Admin CMS pour piloter des sites statiques (type WordPress-like)
> **Stack** : Node.js / Express / Supabase / Vanilla JS
> **Déploiement** : Coolify sur OVH (217.182.89.133)

---

## 1. Vision du projet

Un panneau d'administration centralisé, inspiré de WordPress, permettant de **piloter la création et la gestion de sites statiques**. L'admin permet de modifier le contenu (texte, images, SEO), configurer les paramètres globaux (couleurs, typo, header), prévisualiser les changements en mode draft, puis publier vers le site public.

Le système s'appuie sur l'éditeur inline déjà fonctionnel dans le projet Shootnbox-static (`admin.js`, pipeline `previews/ → build.js → public/`).

---

## 2. Architecture technique

### 2.1 Pipeline de contenu

```
previews/ (source de vérité = DRAFT)
     │
     ▼
  build.js (assemble les sections, corrige les chemins,
            injecte les CSS variables depuis site-config.json,
            split CSS critical/non-critical, cache-busting)
     │
     ▼
  public/ (HTML final = PROD)
     │
     ▼
  Coolify deploy (optionnel, pour push vers le serveur distant)
```

### 2.2 Structure backend

```
server.js (point d'entrée)
│
├── middleware/
│   ├── auth.js              — vérification JWT, extraction user
│   ├── rbac.js              — vérification des permissions par rôle
│   ├── rateLimiter.js       — rate limiting par IP (express-rate-limit)
│   ├── securityHeaders.js   — helmet (HSTS, CSP, X-Frame, etc.)
│   ├── requestLogger.js     — log structuré de chaque requête
│   ├── threatDetector.js    — détection patterns SQLi/XSS/scanner
│   ├── ipBan.js             — vérification IP bannies
│   └── validator.js         — validation/sanitization (Zod)
│
├── routes/
│   ├── auth.js              — login, logout, refresh, sessions
│   ├── users.js             — CRUD users (admin only)
│   ├── sites.js             — CRUD sites
│   ├── tasks.js             — CRUD tasks
│   ├── pages.js             — gestion pages, drafts, publish
│   ├── media.js             — upload, compression, médiathèque
│   ├── settings.js          — paramètres globaux (site-config.json)
│   ├── security.js          — logs, bans, audit
│   └── deploy.js            — déploiement Coolify
│
├── utils/
│   ├── crypto.js            — bcrypt, AES-256-GCM, JWT
│   ├── sanitize.js          — échappement HTML, nettoyage input
│   └── audit.js             — helper pour logger les actions
│
├── public/                  — fichiers frontend de l'admin
│   ├── login.html           — page de connexion
│   ├── index.html           — dashboard
│   ├── pages.html           — gestion des pages
│   ├── settings.html        — paramètres globaux
│   ├── media.html           — médiathèque
│   ├── security.html        — surveillance sécurité
│   ├── users.html           — gestion utilisateurs
│   ├── css/
│   └── js/
│
├── previews/                — fichiers source des sections (draft)
├── scripts/
│   ├── migration.sql        — schéma DB complet
│   └── migrate.js           — exécution migration
└── site-config.json         — paramètres globaux du site piloté
```

### 2.3 Pipeline de sécurité des requêtes

Chaque requête traverse les couches dans cet ordre :

```
Requête entrante
  │
  ▼
[1] IP Ban Check ────── IP bannie ? → 403 Forbidden
  │
  ▼
[2] Rate Limiter ────── Trop de requêtes ? → 429 Too Many Requests
  │                     (100 req/min général, 5 req/min login)
  ▼
[3] Threat Detector ─── Pattern suspect ? → Log + 403 Blocked
  │                     (SQLi, XSS, path traversal, scanner bots)
  ▼
[4] Security Headers ── Ajout HSTS, CSP, X-Frame-Options, etc.
  │
  ▼
[5] Request Logger ──── Log structuré (IP, method, path, user-agent, durée)
  │
  ▼
[6] Auth Middleware ──── Route protégée ? → Vérifier JWT
  │                     Token invalide/expiré ? → 401 Unauthorized
  ▼
[7] RBAC Check ──────── Permission suffisante pour cette action ? → 403 Forbidden
  │
  ▼
[8] Input Validation ── Schema Zod valide ? → 400 Bad Request
  │
  ▼
[9] Route Handler ───── Exécution de la logique métier
  │
  ▼
[10] Audit Log ──────── Enregistrement de l'action (user, action, entité, IP)
  │
  ▼
Réponse
```

---

## 3. Onglets et fonctionnalités

### 3.1 Page de connexion (`/login`)

- Champs : email + mot de passe
- Checkbox "Rester connecté" (étend la durée du refresh token à 30j)
- **5 tentatives max** puis blocage IP progressif (15min → 1h → 24h)
- **JWT** : access token 15min + refresh token 7j (ou 30j si "rester connecté")
- Sessions révocables depuis l'onglet admin
- Log de chaque tentative de connexion (IP, user-agent, succès/échec)
- Affichage discret de l'IP du visiteur et de la dernière connexion réussie

---

### 3.2 Dashboard (`/`)

- **4 cartes stats** : Sites actifs, Tâches en cours, Monitors UP, Total sites
- **Sites récents** : grille des 6 derniers sites avec cards cliquables
- **Tâches récentes** : tableau des 5 tâches prioritaires en cours
- **Alertes** : notifications de sécurité, SSL expirant, sites down
- Accès direct au profil utilisateur connecté

---

### 3.3 Onglet Pages (`/pages`)

#### Vue liste des pages
- **Carte par page** avec :
  - Screenshot/preview de la page publiée
  - Nom de la page et URL
  - Statut : Publiée / Brouillon / Modifiée (draft diverge de prod)
  - Date de dernière publication
  - Bouton **"Voir"** → ouvre la page publique dans un nouvel onglet
  - Bouton **"Éditer"** → ouvre la page en mode éditeur inline
- Bouton **"+ Nouvelle page"** pour créer une page

#### Éditeur inline (repris de Shootnbox-static)
- **Barre admin** en haut : sélecteur de page, compteur de modifications, bouton Publier, SEO, Déconnexion
- **Édition texte** : attributs `data-snb-edit` sur les éléments, contenteditable au clic, sélecteur de tag (H1/H2/H3/H4/P)
- **Édition images** : attributs `data-snb-img` / `data-snb-bg`, toolbar flottante :
  - **Changer** : upload → resize Sharp (2x rendered size) → conversion WebP → cache-busting `?v=timestamp`
  - **Position** : sliders H/V (0-100%) pour ajuster `object-position`
  - Détection via `document.elementsFromPoint()` (traverse les overlays CSS)
- **Galerie (mur)** : CRUD photos par catégorie, resize auto, WebP
- **SEO par page** : panel éditable (title, meta description, og:title, og:description)
- **Pipeline "Publier"** :
  1. Sauvegarde les modifications dans les fichiers `previews/` (source de vérité)
  2. Lance `build.js` → reconstruit le HTML final dans `public/`
  3. Le site public est mis à jour instantanément
- **Avertissement** avant de quitter la page si des modifications non publiées existent
- **Escape** pour annuler une modification en cours
- **Ajout de sections** : possibilité d'ajouter de nouvelles sections à une page depuis une bibliothèque de templates

#### Visualisation responsive
- **Module de preview responsive** intégré à l'éditeur et à la vue pages
- 4 modes de visualisation :
  - **Desktop** : 1920×1080 (pleine largeur)
  - **Laptop** : 1366×768
  - **Tablette** : 768×1024 (portrait) / 1024×768 (paysage)
  - **Mobile** : 375×812 (iPhone) / 390×844 (iPhone Pro) / 360×800 (Android)
- **Iframe redimensionnable** avec cadre device-like (optionnel)
- **Bascule rapide** entre les tailles via barre d'outils avec icônes desktop/tablet/mobile
- **Mode côte-à-côte** : afficher desktop + mobile simultanément pour comparer
- **Preview du draft** : visualiser la version brouillon (pas encore publiée) dans tous les formats
- **Rotation** tablette portrait/paysage en 1 clic
- **Zoom** ajustable pour voir la page complète dans un viewport réduit

---

### 3.4 Onglet Paramètres (`/settings`)

Tous les paramètres sont stockés dans `site-config.json` (et/ou en base Supabase) et injectés automatiquement par `build.js` sous forme de CSS variables.

#### 3.4.1 Identité / Branding
- **Nom du site** (utilisé dans header, SEO, og:site_name)
- **Slogan / Tagline**
- **Logo principal** : upload + dimensions configurables
- **Logo variante** : version blanche/monochrome/petite
- **Favicon** : upload unique → génération automatique des tailles (16/32/180/192/512px)

#### 3.4.2 Palette de couleurs
- **Primaire** (ex: `#E51981`)
- **Secondaire** (ex: `#0250FF`)
- **Tertiaire** (ex: `#a855f7`)
- **Accent 1** (ex: `#FF7A00`)
- **Accent 2** (ex: `#16A34A`)
- **Fond principal** du site
- **Fond sections alternées** (pair/impair)
- **Couleur texte sombre** / **texte clair**
- **Preview live** du rendu à côté de chaque color picker

#### 3.4.3 Typographie
- **Police principale** (corps) : sélecteur Google Fonts ou upload custom
- **Police titres** (si différente)
- **Tailles par niveau** : H1, H2, H3, H4, P, small — valeurs desktop + mobile
- **Line-height** par niveau
- **Font-weight** par niveau (400, 600, 700, 900...)
- **Couleur texte** par défaut + couleur texte secondaire

#### 3.4.4 Header
- **Structure** :
  - Logo : position (gauche/centre), taille, lien vers accueil
  - Menu items : drag & drop pour réordonner, sous-menus dropdown, icônes optionnelles
  - CTA header : bouton à droite (texte, lien, couleur) — ex: "Devis gratuit"
  - Téléphone cliquable (affiché desktop, icône mobile)
  - Bannière top optionnelle : message promo au-dessus du header (texte, couleur fond, lien, bouton fermer)
- **Comportement** :
  - Sticky ON/OFF (reste fixé au scroll)
  - Transparent sur hero ON/OFF (fond transparent → solide au scroll)
  - Effet au scroll : shrink, shadow, changement couleur fond
  - Hauteur desktop / mobile
- **Style mobile** :
  - Hamburger position (gauche/droite)
  - Animation ouverture
- **Preview live** du header dans le panneau de config

#### 3.4.5 Footer
- Colonnes configurables : contenu texte, liens, coordonnées
- Mentions légales / CGV : lien ou page dédiée
- Réseaux sociaux : URLs (Instagram, Facebook, LinkedIn, TikTok, YouTube...)
- Copyright : texte + année automatique

#### 3.4.6 Boutons / CTA
- Style par défaut : border-radius, gradient ou solid, shadow
- Couleur CTA primaire / secondaire
- Effet hover : shine, scale, shadow, color shift
- Texte CTA par défaut ("Demander un devis", "Nous contacter"...)
- Lien CTA par défaut (page contact, tel:, mailto:)

#### 3.4.7 Layout global
- Largeur max du contenu (1200px, 1340px, 1440px...)
- Espacement entre sections (padding top/bottom)
- Style des sections : fond uni, gradient, alternance
- Border-radius global (cards, images, boutons)

#### 3.4.8 Coordonnées / Contact
- Téléphone (affiché header/footer, schema.org JSON-LD)
- Email
- Adresse postale
- Horaires d'ouverture
- Google Maps embed (coordonnées ou Place ID)
- Ces données alimentent automatiquement le schema.org JSON-LD du site

#### 3.4.9 Scripts / Intégrations
- Code custom `<head>` (analytics, pixels, chat widgets)
- Code custom avant `</body>`
- Cookie consent banner ON/OFF + texte configurable
- Chat widget (Crisp, Tawk.to, etc.)
- Pixel Facebook / LinkedIn Insight

#### 3.4.10 Performance / Déploiement
- Domaine du site
- Cache durée (assets statiques)
- Compression ON/OFF
- Minification CSS/JS ON/OFF
- Coolify App UUID + token deploy

#### 3.4.11 Format de sortie `site-config.json`

```json
{
  "identity": {
    "name": "Shootnbox",
    "tagline": "Location Photobooth & Borne Photo Paris",
    "logo": "/images/logo/shootnbox-logo.webp",
    "logoWhite": "/images/logo/shootnbox-logo-white.webp",
    "favicon": "/images/favicon.png"
  },
  "colors": {
    "primary": "#E51981",
    "secondary": "#0250FF",
    "tertiary": "#a855f7",
    "accent1": "#FF7A00",
    "accent2": "#16A34A",
    "textDark": "#1a0a22",
    "textLight": "#ffffff",
    "bgMain": "#ffffff",
    "bgAlt": "#f8eaff"
  },
  "typography": {
    "fontMain": "Raleway",
    "fontHeadings": "Raleway",
    "sizes": {
      "h1": { "desktop": "56px", "mobile": "36px", "weight": 900, "lineHeight": 1.1 },
      "h2": { "desktop": "42px", "mobile": "28px", "weight": 800, "lineHeight": 1.2 },
      "h3": { "desktop": "28px", "mobile": "22px", "weight": 700, "lineHeight": 1.3 },
      "h4": { "desktop": "20px", "mobile": "18px", "weight": 600, "lineHeight": 1.4 },
      "p":  { "desktop": "16px", "mobile": "15px", "weight": 400, "lineHeight": 1.6 },
      "small": { "desktop": "13px", "mobile": "12px", "weight": 400, "lineHeight": 1.5 }
    }
  },
  "header": {
    "logoPosition": "left",
    "logoSize": "150px",
    "sticky": true,
    "transparentOnHero": true,
    "scrollEffect": "shadow",
    "height": { "desktop": "80px", "mobile": "60px" },
    "ctaText": "Devis gratuit",
    "ctaLink": "/contact",
    "phone": "+33 1 23 45 67 89",
    "topBanner": { "enabled": false, "text": "", "bgColor": "#E51981", "link": "" },
    "mobileHamburger": "right"
  },
  "footer": {
    "columns": [],
    "socials": {
      "instagram": "",
      "facebook": "",
      "linkedin": "",
      "tiktok": "",
      "youtube": ""
    },
    "copyright": "© {year} Shootnbox. Tous droits réservés.",
    "legalPage": "/mentions-legales"
  },
  "cta": {
    "borderRadius": "50px",
    "style": "gradient",
    "hoverEffect": "shine",
    "defaultText": "Demander un devis",
    "defaultLink": "/contact"
  },
  "layout": {
    "maxWidth": "1340px",
    "sectionPadding": { "desktop": "80px", "mobile": "50px" },
    "borderRadius": "12px"
  },
  "contact": {
    "phone": "+33 1 23 45 67 89",
    "email": "contact@shootnbox.fr",
    "address": "123 Rue Example, 75001 Paris",
    "hours": "Lun-Ven 9h-18h",
    "mapsPlaceId": ""
  },
  "seo": {
    "titleTemplate": "%page% | Shootnbox",
    "defaultDescription": "",
    "noindex": true,
    "ogImageDefault": "/images/og-default.webp",
    "gtmId": "",
    "searchConsoleId": ""
  },
  "scripts": {
    "headCustom": "",
    "bodyEndCustom": "",
    "cookieConsent": { "enabled": false, "text": "" },
    "chatWidget": ""
  },
  "deploy": {
    "domain": "shootnbox.swipego.app",
    "coolifyUuid": "qgwc8s84k84gskgkwk04s0wk",
    "coolifyToken": "",
    "cacheMaxAge": "365d",
    "compression": true,
    "minify": true
  }
}
```

Le `build.js` lit ce fichier et génère les CSS variables :

```css
:root {
  --color-primary: #E51981;
  --color-secondary: #0250FF;
  --color-tertiary: #a855f7;
  --color-accent1: #FF7A00;
  --color-accent2: #16A34A;
  --color-text-dark: #1a0a22;
  --color-text-light: #ffffff;
  --color-bg-main: #ffffff;
  --color-bg-alt: #f8eaff;
  --font-main: 'Raleway', sans-serif;
  --font-headings: 'Raleway', sans-serif;
  --h1-size: 56px;
  --h2-size: 42px;
  --h3-size: 28px;
  --radius-btn: 50px;
  --radius-card: 12px;
  --max-width: 1340px;
  --section-padding: 80px;
  /* ... */
}
```

---

### 3.5 Onglet Médiathèque (`/media`)

#### Upload & compression
- Upload **drag & drop** ou bouton classique
- **Compression automatique** en WebP (Sharp, qualité configurable 75-95)
- **Redimensionnement auto** selon l'usage :
  - Hero / bannière : max 1920px
  - Card / section : max 1200px
  - Thumbnail / avatar : max 400px
  - Favicon : 32/180/192/512px
- **Avant/Après** : preview fichier original vs compressé avec gain de poids affiché
- **Bulk upload** : plusieurs images d'un coup avec progress bar
- **Génération responsive** : auto-créer des variantes (400w, 800w, 1200w) pour `srcset`

#### Organisation
- **Dossiers** par catégorie (héros, équipe, produits, blog, icônes...)
- **Tags** sur les images (filtrage rapide)
- **Recherche** par nom de fichier
- **Vue grille / liste** avec tri par date, taille, nom
- **Infos** : dimensions, poids, format, date upload, pages qui utilisent l'image

#### Fonctionnalités avancées
- **Éditeur basique intégré** : crop, rotation, flip, luminosité/contraste
- **Alt text** éditable directement (important SEO)
- **Détection images inutilisées** : images uploadées mais non référencées → suggestion de nettoyage
- **Remplacement d'image** : uploader une nouvelle version qui remplace l'ancienne partout (cache-busting auto)

---

### 3.6 Onglet Navigation (`/navigation`)

- **Structure du menu principal** : drag & drop pour réordonner les items
- **Sous-menus** dropdown configurables
- **Liens externes** dans le menu (ex: lien vers un autre site)
- **Lien actif** : highlight automatique selon la page courante
- Synchronisé avec la liste des pages publiées

---

### 3.7 Onglet SEO (`/seo`)

- **Configuration globale** :
  - Template de titre (`%page% | Nom du site`)
  - Meta description par défaut
  - OG Image par défaut
  - Switch `noindex` global ON/OFF (pour passer en prod quand prêt)
  - Google Analytics / GTM ID
  - Google Search Console meta verification
- **Vue par page** :
  - Titre, meta description, og:title, og:description par page
  - Score SEO indicatif par page (présence H1, alt text images, longueur description...)
- **Sitemap** : auto-généré depuis la liste des pages publiées
- **robots.txt** : éditable depuis l'interface

---

### 3.8 Onglet Sécurité (`/security`)

#### Dashboard sécurité
- **Score global** de sécurité (/100)
- **4 cartes** : Statut SSL (valide + jours restants), Requêtes/24h, Erreurs (404/500), Alertes actives
- Bouton "Relancer l'analyse"

#### Monitoring des tentatives d'intrusion
- **Tableau de logs filtrable** (date, IP, requête, type menace, statut, action)
- **Types de menaces détectées** :
  - SQL injection (`' OR 1=1`, `UNION SELECT`, etc.)
  - XSS (`<script>`, `javascript:`, `onerror=`)
  - Path traversal (`../../../etc/passwd`, `..%2f`)
  - Scanner bots (`wp-admin`, `wp-login.php`, `.env`, `phpinfo`, `xmlrpc`)
  - Shell upload attempts (`*.php`, `*.asp`)
  - Rate limit dépassé
  - Bruteforce login
- **Patterns détectés** (regex dans `threatDetector.js`) :
  ```
  sql_injection: /'.*OR|UNION\s+SELECT|INSERT\s+INTO|DROP\s+TABLE/i
  xss: /<script|javascript:|on(error|load|click)\s*=/i
  path_traversal: /\.\.\//g | /etc\/(passwd|shadow)/i
  scanner: /wp-(admin|login)|phpmyadmin|\.env$|xmlrpc\.php/i
  ```

#### Blocage automatique
- **Auto-ban IP** après X tentatives suspectes (configurable : 5, 10, 20)
- **Durée de ban** progressive : 15min → 1h → 24h → permanent
- **Whitelist IP** : IPs jamais bloquées (admin)
- **Blacklist manuelle** : bloquer une IP / range manuellement
- **Géo-blocking** optionnel (bloquer des pays entiers)
- **Historique des bans** avec raison et possibilité de débloquer

#### SSL / Certificats
- Statut SSL : valide / expiré / bientôt expiré
- Date d'expiration avec alerte à J-30, J-14, J-7
- Renouvellement Let's Encrypt via Traefik (affichage du statut)

#### Headers de sécurité vérifiés
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`
- `Referrer-Policy`
- `Permissions-Policy`
- Score avec recommandations si header manquant

#### Intégrité des fichiers
- **Hash SHA256** de chaque fichier au moment du deploy
- **Scan périodique** : compare hash actuels vs référence → alerte si fichier modifié sans passer par le gestionnaire
- **Fichiers inattendus** : détecte les nouveaux fichiers non créés par le système (backdoor potentielle)
- **Monitoring `.env`** : alerte si accessible publiquement

#### Audit de vulnérabilités
- **Dépendances npm** : `npm audit` automatique, affichage des CVE
- **Score Lighthouse** best practices
- **Scan des ports** ouverts sur le serveur
- **Version Node.js** : alerte si version obsolète
- **Permissions fichiers** : vérifier que les fichiers sensibles ne sont pas world-readable

---

### 3.9 Onglet Performances (`/performances`)

- **Lighthouse automatique** : lance un scan depuis le gestionnaire, affiche les 4 scores (Performance, Accessibility, SEO, Best Practices)
- **Core Web Vitals** : LCP, FID/INP, CLS
- **Poids de page** : graphique du poids total par page (HTML + CSS + JS + images)
- **Waterfall de chargement** : quelles ressources ralentissent le site
- **Historique** : évolution des scores dans le temps (graphique)
- **Alertes** si un score passe sous un seuil configurable

---

### 3.10 Onglet Activité (`/activity`)

- **Journal d'activité** : qui a modifié quoi, quand
  - "18/03 14:30 — admin : Page Accueil, texte hero modifié"
  - "18/03 14:28 — admin : Image team-021.webp remplacée"
  - "18/03 14:25 — admin : Déploiement lancé (succès)"
- **Filtrage** par utilisateur, par type d'action, par date
- **Historique de versions** : snapshot avant chaque publication → pouvoir revenir à une version précédente
- **Diff visuel** : voir les changements entre version actuelle et précédente

---

### 3.11 Onglet Monitoring (`/monitoring`)

- **Ping automatique** toutes les 5 minutes
- **Temps de réponse** moyen : graphique 24h / 7j / 30j
- **Alertes downtime** : notification si le site ne répond plus (webhook, email)
- **Statut Coolify** : état du container (running, stopped, deploying)
- **Certificat SSL** : jours restants avant expiration
- **Espace disque** du serveur

---

### 3.12 Onglet Backups (`/backups`)

- **Snapshot automatique** avant chaque publication (sauvegarde des previews + public + config)
- **Historique des backups** (derniers 30 jours)
- **Restauration en 1 clic** vers une version antérieure
- **Export complet** du site (ZIP téléchargeable : HTML + images + config)
- **Export de la config seule** (JSON) pour dupliquer le site vers un nouveau projet

---

### 3.13 Onglet Déploiement (`/deploy`)

- **Bouton "Déployer en prod"** (appel API Coolify)
- **Historique des déploiements** : date, durée, succès/échec, utilisateur
- **Config Coolify** : UUID app, token, domaine
- **Statut en temps réel** du dernier déploiement
- **Rollback** : redéployer une version précédente

---

### 3.14 Onglet Redirections (`/redirections`)

- Gérer les redirections 301/302 (`/ancienne-url → /nouvelle-url`)
- Import en masse (utile pour migrations WordPress → statique)
- Détection automatique des 404 avec suggestion de redirection
- Test de redirection depuis l'interface

---

### 3.15 Onglet Planification (`/schedule`)

- **Publication programmée** : préparer un changement et le publier à une date/heure définie
- **Mode maintenance** : activer une page maintenance en 1 clic pendant les interventions
- **Calendrier** visuel des publications planifiées

---

### 3.16 Onglet Admin — Utilisateurs (`/users`)

#### Gestion des comptes
- **Créer un utilisateur** : email, nom d'utilisateur, mot de passe, rôle
- **Modifier** : changer le rôle, réinitialiser le mot de passe, désactiver le compte
- **Supprimer** un utilisateur
- **Liste** avec : avatar, email, rôle, statut actif/inactif, dernière connexion, nombre de connexions, date de création
- **Invitation par email** (optionnel) : envoyer un lien d'activation

#### Niveaux d'accès (RBAC)

| Permission                          | Admin | Éditeur | Lecteur |
|-------------------------------------|-------|---------|---------|
| Voir le dashboard                   | oui   | oui     | oui     |
| Voir les pages / sites              | oui   | oui     | oui     |
| Visualisation responsive            | oui   | oui     | oui     |
| Éditer le contenu des pages         | oui   | oui     | non     |
| Uploader des médias                 | oui   | oui     | non     |
| Publier (draft → prod)              | oui   | non     | non     |
| Modifier les paramètres globaux     | oui   | non     | non     |
| Gérer le header / footer / nav      | oui   | non     | non     |
| Voir les credentials                | oui   | masqué  | non     |
| Créer/supprimer des sites           | oui   | non     | non     |
| Déployer en prod (Coolify)          | oui   | non     | non     |
| Gérer les utilisateurs              | oui   | non     | non     |
| Voir les logs de sécurité           | oui   | non     | non     |
| Voir les logs d'activité            | oui   | oui (les siens) | non |
| Bannir des IPs                      | oui   | non     | non     |
| Gérer les backups                   | oui   | non     | non     |
| Gérer les redirections              | oui   | non     | non     |
| Planifier une publication           | oui   | oui     | non     |

#### Sessions actives
- Liste de toutes les sessions actives par utilisateur
- Infos : navigateur, OS, IP, date de création, expiration
- **Révoquer** une session individuelle
- **Révoquer toutes** les sessions d'un utilisateur (force la déconnexion)

---

## 4. Schéma de base de données

### 4.1 Tables existantes (à conserver)

- `site_manager_sites` — sites web gérés
- `site_manager_contacts` — contacts associés aux sites
- `site_manager_credentials` — credentials (à chiffrer AES-256-GCM)
- `site_manager_tasks` — tâches / interventions
- `site_manager_notes` — notes / journal d'activité
- `site_manager_monitors` — monitoring uptime

### 4.2 Nouvelles tables

```sql
-- Utilisateurs
CREATE TABLE site_manager_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor'
        CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    last_login TIMESTAMPTZ,
    login_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE site_manager_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal d'audit
CREATE TABLE site_manager_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tentatives de connexion
CREATE TABLE site_manager_login_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT,
    ip_address INET NOT NULL,
    success BOOLEAN DEFAULT false,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IPs bannies
CREATE TABLE site_manager_ip_bans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address INET NOT NULL,
    reason TEXT,
    banned_by UUID REFERENCES site_manager_users(id),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Événements de sécurité
CREATE TABLE site_manager_security_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address INET NOT NULL,
    request_method TEXT,
    request_path TEXT,
    request_body TEXT,
    threat_type TEXT
        CHECK (threat_type IN (
            'sql_injection', 'xss', 'path_traversal',
            'scanner', 'bruteforce', 'rate_limit', 'other'
        )),
    severity TEXT DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    blocked BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backups
CREATE TABLE site_manager_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id),
    type TEXT DEFAULT 'publish'
        CHECK (type IN ('publish', 'manual', 'scheduled')),
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Redirections
CREATE TABLE site_manager_redirections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    status_code INT DEFAULT 301 CHECK (status_code IN (301, 302)),
    hit_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Publications programmées
CREATE TABLE site_manager_scheduled_publishes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES site_manager_users(id),
    page_slug TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'cancelled', 'failed')),
    snapshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_sm_sessions_user ON site_manager_sessions(user_id);
CREATE INDEX idx_sm_sessions_expires ON site_manager_sessions(expires_at);
CREATE INDEX idx_sm_audit_user ON site_manager_audit_log(user_id);
CREATE INDEX idx_sm_audit_entity ON site_manager_audit_log(entity_type, entity_id);
CREATE INDEX idx_sm_audit_created ON site_manager_audit_log(created_at);
CREATE INDEX idx_sm_login_ip ON site_manager_login_attempts(ip_address, created_at);
CREATE INDEX idx_sm_login_email ON site_manager_login_attempts(email, created_at);
CREATE INDEX idx_sm_bans_ip ON site_manager_ip_bans(ip_address);
CREATE INDEX idx_sm_security_ip ON site_manager_security_events(ip_address, created_at);
CREATE INDEX idx_sm_security_type ON site_manager_security_events(threat_type, created_at);
CREATE INDEX idx_sm_redirections_source ON site_manager_redirections(source_path);
CREATE INDEX idx_sm_scheduled_status ON site_manager_scheduled_publishes(status, scheduled_at);
```

---

## 5. Sécurité — Corrections à appliquer

### 5.1 Vulnérabilités critiques (P0)

| # | Problème | Correction |
|---|----------|------------|
| 1 | Zero authentification sur toutes les routes API | Ajouter middleware auth JWT sur toutes les routes `/api/*` |
| 2 | Service Role Key Supabase hardcodée dans le code | Déplacer en `.env` uniquement, retirer tous les fallback hardcodés |
| 3 | Clé Supabase exposée dans `public/js/config.js` | Supprimer ce fichier, toutes les requêtes passent par Express |
| 4 | `req.body` passé directement à Supabase sans validation | Valider chaque champ avec Zod avant insertion |
| 5 | Pas de CORS | Configurer `cors()` avec whitelist d'origines |
| 6 | XSS dans le frontend (innerHTML avec données non échappées) | Échapper toutes les données avec une fonction `escapeHtml()` |
| 7 | Credentials stockés en clair | Chiffrer avec AES-256-GCM, clé dans `ENCRYPTION_KEY` env var |

### 5.2 Vulnérabilités hautes (P1)

| # | Problème | Correction |
|---|----------|------------|
| 8 | Pas de rate limiting | `express-rate-limit` : 100 req/min global, 5 req/min login |
| 9 | Pas de headers de sécurité | `helmet` middleware |
| 10 | Pas de validation UUID sur les paramètres | Regex UUID v4 avant chaque requête DB |
| 11 | SPA fallback retourne 200 pour toute URL | Retourner 404 pour les routes non reconnues |
| 12 | Pas de limite body size | `express.json({ limit: '1mb' })` |
| 13 | Pas de logging | Logger structuré (winston ou pino) |

### 5.3 Vulnérabilités moyennes (P2)

| # | Problème | Correction |
|---|----------|------------|
| 14 | Pas de pagination | Ajouter `?page=1&limit=50` sur tous les listings |
| 15 | DELETE cascade sans avertissement | Ajouter confirmation côté API + log audit |
| 16 | Navigation HTML dupliquée dans chaque page | Composant JS injecté ou build qui assemble |
| 17 | N+1 queries sur le dashboard (1 requête tasks par site) | Une seule requête avec jointure |
| 18 | Pas de feedback utilisateur (toast) | Ajouter système de notifications toast |
| 19 | Pas de gestion d'erreurs côté client | Try/catch + affichage toast sur erreur API |

---

## 6. Dépendances à ajouter

```json
{
  "dependencies": {
    "express": "^4.21.x",
    "@supabase/supabase-js": "^2.49.x",
    "bcrypt": "^5.1.x",
    "jsonwebtoken": "^9.0.x",
    "helmet": "^8.x",
    "cors": "^2.8.x",
    "express-rate-limit": "^7.x",
    "zod": "^3.x",
    "sharp": "^0.34.x",
    "multer": "^1.4.x",
    "compression": "^1.8.x",
    "cookie-parser": "^1.4.x",
    "pino": "^9.x",
    "pino-pretty": "^11.x"
  }
}
```

---

## 7. Priorités d'implémentation

### Phase 1 — Fondations sécurisées
1. Restructuration server.js en modules (middleware/, routes/, utils/)
2. Auth : login, JWT, sessions, bcrypt
3. RBAC : middleware de permissions par rôle
4. Sécurisation : helmet, CORS, rate limiting, validation Zod
5. Page de connexion
6. Suppression de `config.js`, externalisation des clés en `.env`

### Phase 2 — CMS Core
7. Onglet Pages : vue liste avec cards, statut draft/publié
8. Éditeur inline (intégration du code Shootnbox)
9. Visualisation responsive (iframe multi-device)
10. Onglet Paramètres globaux avec `site-config.json`
11. Intégration build.js avec injection des CSS variables

### Phase 3 — Médias & Contenu
12. Médiathèque : upload, compression WebP, organisation
13. Onglet Navigation : drag & drop menu
14. Onglet SEO : config globale + vue par page
15. Templates de sections (bibliothèque réutilisable)

### Phase 4 — Surveillance & Opérations
16. Onglet Sécurité : logs, threat detection, bans, audit
17. Onglet Performances : Lighthouse, Core Web Vitals
18. Onglet Monitoring : uptime, temps de réponse
19. Onglet Activité : journal, historique versions, diff

### Phase 5 — Opérations avancées
20. Onglet Backups : snapshots, restauration, export
21. Onglet Déploiement : intégration Coolify, historique
22. Onglet Redirections : 301/302, détection 404
23. Onglet Planification : publication programmée, mode maintenance
24. Onglet Admin/Utilisateurs : CRUD, sessions, invitations

---

## 8. Notes techniques

- **Pas de framework frontend** : rester en Vanilla JS pour la cohérence avec Shootnbox et la légèreté
- **Supabase** : utiliser le même instance self-hosted (`supabase-api.swipego.app`) avec les tables préfixées `site_manager_`
- **Coolify** : déploiement Docker sur le serveur OVH `217.182.89.133`
- **Previews = source de vérité** : les fichiers `previews/*.html` sont les drafts, `public/` est la prod assemblée par `build.js`
- **Chiffrement credentials** : AES-256-GCM avec `ENCRYPTION_KEY` en variable d'environnement, jamais de mots de passe en clair
- **Mots de passe utilisateurs** : bcrypt avec salt rounds = 12
- **JWT** : signé avec `JWT_SECRET` en variable d'environnement, jamais hardcodé
