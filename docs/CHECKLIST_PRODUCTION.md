# Checklist Pre-Production

> A verifier avant chaque deploiement d'une nouvelle page ou modification majeure.
> Cocher chaque item avant de lancer le build + deploy.

---

## SEO

- [ ] Page a un `<title>` unique (50-60 chars, mot-cle en premier)
- [ ] Page a une `<meta name="description">` unique (150-160 chars)
- [ ] Page a un `<link rel="canonical">`
- [ ] Page a un seul `<h1>` contenant le mot-cle principal
- [ ] Hierarchie headings respectee (h1 → h2 → h3, pas de saut)
- [ ] 3-5 liens internes minimum avec ancres descriptives
- [ ] Breadcrumbs presents (sauf homepage)
- [ ] Donnees structurees JSON-LD presentes (LocalBusiness + type specifique)
- [ ] Pas de contenu duplique avec d'autres pages
- [ ] OG tags complets (title, description, image 1200x630)
- [ ] Twitter Card configuree

## Images

- [ ] Toutes en WebP (< 200kB pour hero, < 150kB pour sections)
- [ ] Toutes ont `width` + `height` explicites (via imageDimensions dans build.js)
- [ ] Toutes ont un `alt` descriptif (pas vide, pas "image de")
- [ ] Image hero/LCP en `loading="eager"` avec `fetchpriority="high"`
- [ ] Images sous le fold en `loading="lazy"` (auto par build.js)
- [ ] Noms de fichiers descriptifs (`photobooth-mariage.webp`, pas `IMG_4523.webp`)

## Performance

- [ ] PageSpeed mobile ≥ 95
- [ ] PageSpeed desktop ≥ 98
- [ ] LCP ≤ 1.8s
- [ ] CLS ≤ 0.05
- [ ] CSS critique inline (blocs 1-3, auto par build.js)
- [ ] JS non-bloquant (scripts en fin de body)
- [ ] Pas de bibliotheque JS lourde ajoutee
- [ ] Polices Raleway preload (woff2)

## Accessibilite

- [ ] Navigation clavier complete (Tab, Enter, Escape)
- [ ] Focus visible (`:focus-visible` avec outline)
- [ ] Skip to content present
- [ ] Contrastes couleur conformes (4.5:1 texte, 3:1 grand texte)
- [ ] Touch targets ≥ 44x44px sur mobile
- [ ] Pas de scroll horizontal sur mobile
- [ ] Labels sur tous les champs formulaire
- [ ] ARIA labels sur boutons sans texte visible

## Securite

- [ ] Pas de secret dans le code source
- [ ] Headers securite actifs (CSP, HSTS, X-Frame-Options)
- [ ] Liens externes avec `rel="noopener noreferrer"` (auto par build.js)
- [ ] Formulaires avec validation serveur + honeypot

## Tracking & Legal

- [ ] GTM ID configure dans site-config.json (quand pret)
- [ ] GTM charge uniquement apres consentement cookies
- [ ] Evenements de conversion configures (form_submission, cta_click, phone_click)
- [ ] Banniere cookies RGPD active
- [ ] Page mentions legales publiee
- [ ] Page politique de confidentialite publiee
- [ ] Mention RGPD sous les formulaires

## Contenu

- [ ] Tous les textes relus et sans fautes
- [ ] Photos de qualite professionnelle (photos reelles Shootnbox)
- [ ] Formulaire de contact teste (envoi + reception)
- [ ] Numero de telephone cliquable (`tel:+33145016666`)
- [ ] Liens sociaux pointent vers les bons profils
- [ ] CTA visibles et fonctionnels

## Deploiement

- [ ] `node scripts/build.js` execute sans erreur
- [ ] Preview verifiee en local
- [ ] Changements commites et pushes
- [ ] Deploy Coolify lance
- [ ] Site en ligne verifie apres deploy

---

## Checklist specifique — Nouvelle page

En plus de tout ce qui precede :

- [ ] Page ajoutee dans le tableau `pages` de `build.js`
- [ ] Sections creees dans `previews/<slug>/`
- [ ] Header/footer partages inclus (`previews/_shared/`)
- [ ] Image dimensions ajoutees dans `imageDimensions` (build.js)
- [ ] Page ajoutee dans la navigation (`site-config.json` > menuItems)
- [ ] Sitemap regenere (`/api/seo/sitemap`)
- [ ] Liens internes ajoutes depuis les autres pages

## Checklist specifique — Page ville

En plus de tout ce qui precede :

- [ ] Minimum 60% de contenu unique par rapport aux autres pages villes
- [ ] Lieux d'evenements locaux mentionnes
- [ ] Distance/temps de trajet depuis Paris
- [ ] FAQ locale (pas copie-colle de la page principale)
- [ ] Schema.org LocalBusiness avec geo coordinates de la ville
- [ ] CTA avec mention de la ville
