# Qualite Technique — Standards de Production

> Regles de qualite applicables a chaque page construite par le gestionnaire.
> Ces regles sont soit verifiees automatiquement par `build.js`, soit a respecter lors de la creation des blocs HTML.

---

## 1. PERFORMANCE & CORE WEB VITALS

### Seuils obligatoires

| Metrique | Seuil "Good" | Objectif Shootnbox |
|----------|-------------|-------------------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | **≤ 1.8s** |
| **INP** (Interaction to Next Paint) | ≤ 200ms | **≤ 150ms** |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | **≤ 0.05** |
| **FCP** (First Contentful Paint) | ≤ 1.8s | **≤ 1.2s** |
| **PageSpeed mobile** | 90+ | **95+** |
| **PageSpeed desktop** | 90+ | **98+** |

### Images — Regles de production

| Type | Format | Qualite | Taille max |
|------|--------|---------|-----------|
| Photos hero | WebP | 80-85% | 200kB |
| Photos sections | WebP | 80-85% | 150kB |
| Logos/illustrations | SVG ou WebP | N/A | 20kB |
| Icones | SVG inline | N/A | 5kB |
| Thumbnails | WebP | 75% | 50kB |
| OG Images | JPEG | 85% | 100kB (1200x630px) |

### Images — Regles HTML (auto par build.js)

- **Toutes les images ont `width` + `height`** → previent le CLS
- **`loading="lazy"`** sur les images sous le fold (auto)
- **`loading="eager"` + `fetchpriority="high"`** sur l'image hero/LCP (pas de lazy)
- **`decoding="async"`** sur toutes les images (auto)
- **`alt` descriptif** sur chaque image (a remplir manuellement)

### CSS — Regles

- **CSS critique inline** : blocs 1-3 sont inlines dans le `<head>` (auto par build.js)
- **CSS non-critique** : fichier externe avec cache-busting `?v=timestamp` (auto)
- **Animations** : uniquement `transform` et `opacity` (proprietes composites, pas de reflow)
- **`will-change`** : avec parcimonie, uniquement sur les elements effectivement animes
- **Pas de CSS inutilise** en production

### JavaScript — Regles

- **Scripts extraits** en fichier externe avec cache-busting (auto par build.js)
- **Pas de JS bloquant** : tout en fin de body ou `defer`
- **Event handlers optimises** : `requestAnimationFrame` sur mousemove/scroll
- **Pas de `eval()`** ni `atob()` pour du code
- **Pas de bibliotheque lourde** : pas de jQuery, pas de Moment.js, pas de Font Awesome

### DOM — Limites

- **Max 1500 elements** par page
- **Profondeur max 32 niveaux** d'imbrication
- **Pas de layout thrashing** : lire puis ecrire le DOM, pas alterner

### Polices

- **Raleway self-hosted** en WOFF2 uniquement
- **`font-display: swap`** pour eviter le CLS
- **Preload** de la variante critique (900 italic pour les heros)
- **Subset latin** uniquement

---

## 2. SECURITE

### Headers HTTP (dans server.js)

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com; font-src 'self'; frame-src https://www.youtube.com https://www.google.com
```

### Formulaires

- **Validation cote serveur** obligatoire (Zod dans le gestionnaire)
- **Honeypot** : champ invisible, rejet silencieux si rempli
- **Rate limiting** : max 5 soumissions par IP par heure
- **Sanitisation** : pas de HTML dans les champs texte

### Variables d'environnement

- **`.env` dans `.gitignore`** — jamais de secret dans le code
- **Cles API cote serveur uniquement**
- **GitHub Push Protection** active (bloque les secrets dans les commits)

### Dependances

- **`npm audit`** regulier : 0 vulnerabilite high/critical
- **Pas de `npm install` sans justification**

---

## 3. ACCESSIBILITE (WCAG 2.1 AA)

### Navigation clavier

- **Tous les elements interactifs sont atteignables** au clavier (Tab, Enter, Escape)
- **Focus visible** sur tous les elements focusables :
  ```css
  :focus-visible {
    outline: 2px solid #E51981;
    outline-offset: 2px;
  }
  ```
- **Skip to content** : lien invisible au focus en haut de page
  ```html
  <a href="#main-content" class="skip-link">Aller au contenu principal</a>
  ```

### ARIA & Semantique

- **ARIA labels** sur les elements interactifs sans texte visible
  ```html
  <button aria-label="Ouvrir le menu de navigation">...</button>
  ```
- **Landmarks semantiques** : `<header>`, `<nav>`, `<main>`, `<footer>`, `<section>`
- **Labels sur tous les champs** de formulaire avec `aria-describedby` pour les erreurs

### Contrastes & Lisibilite

- **Ratio minimum 4.5:1** pour le texte normal
- **Ratio minimum 3:1** pour les grands textes (≥ 18px bold ou ≥ 24px)
- **Pas d'information vehiculee uniquement par la couleur**
- **Site utilisable a 200% de zoom**

### Media

- **Sous-titres** pour les videos
- **Touch targets** : minimum 44x44px pour tous les elements cliquables sur mobile
- **Pas de scroll horizontal** sur mobile

---

## 4. TRACKING & ANALYTICS

### Stack

- **Google Tag Manager** (GTM) : gestionnaire centralise — 1 seul script
- **Google Analytics 4** (GA4) : via GTM
- **Google Search Console** : monitoring SEO

### Evenements a tracker

| Evenement | Declencheur | Priorite |
|-----------|-------------|---------|
| `page_view` | Chaque page | Auto (GTM) |
| `form_submission` | Soumission formulaire devis/contact | Haute |
| `cta_click` | Clic CTA principal ("Obtenir un devis") | Haute |
| `phone_click` | Clic numero de telephone | Haute |
| `email_click` | Clic adresse email | Moyenne |
| `social_click` | Clic vers reseaux sociaux | Basse |
| `scroll_depth` | 25%, 50%, 75%, 100% de scroll | Moyenne |
| `faq_expand` | Ouverture d'une question FAQ | Basse |
| `video_play` | Lecture video | Moyenne |

### Implementation DataLayer

```html
<script>
window.dataLayer = window.dataLayer || [];
function trackEvent(name, params) {
  window.dataLayer.push({ event: name, ...params });
}
</script>
```

### GTM — Chargement conditionnel

**GTM ne doit se charger qu'APRES le consentement cookies.**

```html
<!-- Charge GTM seulement apres acceptation -->
<script>
function loadGTM(gtmId) {
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer', gtmId);
}
</script>
```

### Google Search Console

- Verification par enregistrement DNS TXT
- Sitemap soumis : `https://shootnbox.fr/sitemap.xml`
- Monitoring : couverture, Core Web Vitals, erreurs 404, actions manuelles

---

## 5. RGPD & CONFORMITE LEGALE

### Banniere cookies

- **Solution** : Tarteaucitron.js (open source, conforme CNIL, francais)
- **Comportement** :
  - Affichee au premier visit
  - Aucun cookie non essentiel avant consentement explicite
  - GTM/GA4 ne charge qu'apres acceptation
  - Refus aussi facile que l'acceptation (meme nombre de clics)
  - Choix modifiable a tout moment (lien en footer)

### Categories de cookies

| Categorie | Exemples | Consentement |
|-----------|----------|-------------|
| Essentiels | Session, preferences | Non |
| Analytiques | GA4, Clarity | Oui |
| Marketing | Facebook Pixel, Google Ads | Oui |

### Pages legales obligatoires

1. **Mentions legales** (`/mentions-legales/`) — Editeur, SIRET, adresse, hebergeur, propriete intellectuelle
2. **Politique de confidentialite** (`/politique-de-confidentialite/`) — Donnees collectees, finalites, droits
3. **Politique cookies** (`/politique-cookies/`) — Liste des cookies, duree, gestion

### Formulaires

- Checkbox non pre-cochee pour newsletter
- Mention sous chaque formulaire : "Les donnees sont traitees par Shootnbox pour [finalite]."
- Minimisation : ne demander que les champs necessaires

---

## 6. SOCIAL MEDIA & PARTAGE

### Open Graph

- Image OG par page : **1200x630px**, texte lisible a petite taille
- Tester avec Facebook Debug Tool apres modification

### Boutons de partage (blog)

Liens directs, sans scripts tiers lourds :
```javascript
const shareLinks = {
  facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  twitter: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
  linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
  whatsapp: `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`
};
```

### Liens sociaux footer

Instagram, Facebook, TikTok, YouTube — deja dans `site-config.json`

---

## 7. CACHE

### Navigateur (dans server.js)

| Ressource | Cache-Control | Duree |
|-----------|-------------|-------|
| `/site-images/*` | `public, max-age=31536000, immutable` | 1 an |
| `/fonts/*` | `public, max-age=31536000, immutable` | 1 an |
| CSS/JS (avec `?v=`) | `public, max-age=31536000, immutable` | 1 an |
| Pages HTML | `public, max-age=3600, stale-while-revalidate=86400` | 1h + 24h stale |

### Cache-busting

- Images : `?v=timestamp` apres chaque upload via l'admin (auto)
- CSS/JS : `?v=timestamp` ajoute par build.js (auto)
- **Jamais de cache sans busting** sur les ressources modifiables

---

## 8. EMAILS & DELIVRABILITE

### DNS obligatoires (quand migration vers shootnbox.fr)

```
SPF:   v=spf1 include:_spf.google.com ~all
DKIM:  Signature fournie par le service d'envoi
DMARC: v=DMARC1; p=quarantine; rua=mailto:dmarc@shootnbox.fr; pct=100
```

### Objectif : 10/10 sur mail-tester.com

---

## 9. PAGES D'ERREUR

### 404

- Page custom avec design Shootnbox
- Liens utiles : accueil, services, contact
- Pas de page blanche ou de page serveur par defaut

### Monitoring

- UptimeRobot (gratuit) : homepage, pages services, formulaire
- Alertes par email si downtime > 1 min
