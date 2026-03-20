# Shootnbox - Admin SEO & Todo

## Page Home (shootnbox.swipego.app)
### Deployes et valides
- header, hero, trust, bento, stats, avis, equipe, savoirfaire, mur, carte-france, blog, footer
- Bornes deploye sur home (module bornes avec photos Ring/Vegas/Miroir/Spinner)

### SEO a faire (home)
- [ ] H2 -> H1 sur le hero (SEO : un seul H1 par page)
- [ ] Retirer `noindex, nofollow` quand le site est pret pour Google
- [ ] Ajouter des `<p>` descriptions dans les cartes bento (contenu textuel pour SEO)
- [ ] Verifier les alt text des images (certains sont generiques "Client 3", etc.)

---

## Page Location Photobooth (shootnbox.swipego.app/location-photobooth/)

### Modules deployes (ordre)
1. **header** (partage avec home)
2. **hero** - Hero specifique location photobooth (borne Ring supprimee, animations gardees)
3. **intro** - Introduction avec texte + photos empilees a droite
4. **bornes** - 4 cartes bornes (Ring/Vegas/Miroir/Spinner) + module tarifs integre
5. **avis** - H2 custom + carousel logos confiance + 31 avis Google
6. **usages** - "Un photobooth pour chaque occasion" (taille reduite)
7. **service-v2** - 5 etapes neumorphism + icones 3D SVG + tilt JS + 2 cartes bottom (livraison/support)
8. **fabrication** - Made in France (borne photo + glow bar + mini-cartes flottantes + layers tricolores + texte neumorphism)
9. **comparatif** - Shootnbox vs concurrents (cartes 3D neumorphism + tilt)
10. **couverture** - Galerie photos equipe/bureau + Google Maps + livraison partout en France
11. **faq** - 6 questions/reponses (details/summary natif, fond vert pastel, icones glossy)
12. **blog** - 6 articles WordPress statiques + carousel JS
13. **footer** (partage avec home)

### Build config
- `build.js` : sections = `['hero', 'intro', 'bornes', 'avis', 'usages', 'service-v2', 'fabrication', 'comparatif', 'couverture', 'faq', 'blog']`
- CSS split : blocs 1-3 critical inline, reste en fichier externe avec cache-busting
- `previewDir` = `previews/location-photobooth/`
- Toutes les images en WebP

### Ce qui a ete fait

#### Module Bornes
- Fond pastel gradient (pas sombre) : `linear-gradient(180deg, #f8eaff, #fce8f4, #f0e4ff, #eaf0ff)`
- Glows decoratifs (rose, violet, bleu)
- Separateur rose entre intro et bornes (`180px, gradient transparent->rose->transparent`)
- Suppression du sous-titre "4 bornes au choix, livrees partout en France"
- Photos locales des bornes dans `public/images/bornes/` (ring-1 a 6, vegas-1 a 5, miroir-1 a 3, spinner-1 + video)

#### Module Tarifs (integre dans bornes.html, sous les cartes)
- Layout split : gauche glassmorphism + droite neumorphism
- **Carte gauche** : H2 "Nos tarifs de location photobooth", 4 checks colores (2x2 grid), separateur, description, bouton CTA rose centre
- **Panel droit** : 3 cartes arguments neumorphism
  - Fond lilas : `linear-gradient(160deg, #f0dff5, #e8d4f0, #f2e6f8)`
  - Inset shadows neumorphism
  - Bordures neon colorees (rose/violet/vert) avec glow au hover
  - Icones glossy 3D avec reflet `::after`
  - Watermarks "01/02/03" en filigrane (opacity 0.12)
- Sparkles animes sur la carte gauche
- Shimmer gradient anime en haut de la carte gauche
- Blobs pulses en arriere-plan
- Max-width: 1340px
- Responsive: grille 1 colonne < 900px

#### Module Avis (location-photobooth)
- Copie de `previews/avis.html` dans `previews/location-photobooth/avis.html`
- Ajout H2 : "Vous meritez le meilleur : decouvrez les avis sur nos photobooths"
- Ajout carousel logos confiance (identique au module trust de la home)
  - 19 logos en defilement infini, gris -> couleur au hover
  - CSS animation `avisTrustScroll` (distinct de `scroll-logos` de la home)

#### Module Etapes -> remplace par Service-v2
- Ancien module etapes RETIRE du build (remplace par service-v2)
- Previews etapes gardees en archive : `etapes.html`, `etapes-v2.html`

#### Module Service-v2 (DEPLOYE)
- 5 cartes etapes neumorphism avec bordures neon colorees (rose/bleu/violet/orange/vert)
- Icones 3D SVG glossy avec float animation et ground shadow
- Tilt effect au mousemove (JS perspective transform)
- SVG gradient IDs prefixes : `s2` desktop, `m2` mobile (evite conflits)
- 2 cartes bottom : livraison (bleu) + support (fuchsia) avec photos
- Photos : `agence/bureau-bis.jpg`, `camion-shootnbox-v2.jpg`, `sarah-appel.jpg`, `equipe-shootnbox.jpg`
- CTA principal gradient rose, shine hover
- Mobile : meme style neumorphism + icones 3D SVG
- Watermarks masques (`display: none`)
- Cartes meme hauteur via `align-items: stretch` + `flex: 1`

#### Module Usages (DEPLOYE - taille reduite)
- Padding reduit : 80px -> 50px
- Titre : 42px -> 32px, sous-titre : 16px -> 14px
- Tabs : 160px -> 130px, panel : 44px -> 28px padding
- Points texte : 15px -> 13px, galerie : 150px -> 110px

#### Module Fabrication francaise (DEPLOYE)
- Layout 2-col grid (1fr 1.5fr), responsive 1-col < 768px
- **Gauche** : cadre neumorphism, borne photo (220px max), glow bar rose au pied, badge Made in France SVG flottant, 3 mini-cartes flottantes (Usine Normandie bleu, Eco-responsable rose, Logiciel maison violet), 3 layers tricolores (bleu/blanc/rouge)
- **Droite** : cadre neumorphism bleu, barre tricolore en haut, H2 centre (24px), separateur tricolore, 2 paragraphes (14.5px), blockquote pastel violet/rose (fond semi-transparent), 4 tags une ligne (10px nowrap), CTA centre
- Fond section : `linear-gradient(160deg, #e8d4f0, #dfc8e8, #e6d8f2)`
- Mini-cartes et layers masques en mobile
- Image : `public/images/borne-made-in-france.png`

### Admin Edition d'images (11 mars 2026 - DEPLOYE)
- **Changer image** : bouton "Changer" sur hover, upload multer + sharp, resize (renderedSize x2), WebP 85, cache-busting `?v=timestamp`
- **Positionner image** : sliders H/V (0-100%), object-position inline, bouton "Appliquer"
- **Detection** : `document.elementsFromPoint()` traverse les overlays CSS
- **Toolbar flottante** : centree sur l'image, disparait au mouseleave (300ms)
- **Mur gallery** : ajout/suppression photos par categorie, resize auto
- **Auth** : signed cookie HMAC SHA256, persiste entre les deploys
- **Fichiers** : `admin/admin.js`, `admin/admin.css`, `admin/login.html`, endpoints dans `server.js`
- **`pageSections`** dans server.js doit matcher `pages` dans build.js
- **IMPORTANT** : seuls les fichiers preview sans suffixe sont actifs (intro.html, pas intro-v3.html)

### Fichiers de travail (previews non deployes)
- `bornes-option1.html` - Option 1 : 3 glass cards centrees (pas retenu)
- `bornes-option2.html` - Option 2 : split gauche/droite + badges flottants (pas retenu)
- `bornes-option3.html` - Option 3 : grande glass card + enrichie (pas retenu)
- `bornes-option4.html` - Option 4 : split glass + neumorphism (RETENU, integre dans bornes.html)
- `etapes-v2.html` - Version neumorphism des etapes (en attente de validation)
- `intro-v1.html`, `intro-v2.html`, `intro-v3.html` - Variantes intro (BROUILLONS, ne pas modifier)

### SEO a faire (location-photobooth)
- [ ] Verifier hierarchie H1/H2 (actuellement pas de H1 visible)
- [ ] Retirer `noindex, nofollow` quand pret
- [ ] Ajouter meta description specifique (deja fait dans build.js)
- [ ] Verifier les alt text des images bornes

---

## Design System - Conventions

### Couleurs principales
- Rose Shootnbox : `#E51981` / gradient `#E51981 -> #ff6eb4`
- Bleu : `#0250FF` / gradient `#0250FF -> #4d8bff`
- Violet : `#a855f7` / gradient `#a855f7 -> #c084fc`
- Orange : `#FF7A00` / gradient `#FF7A00 -> #ff9a3c`
- Vert : `#16A34A` / gradient `#16A34A -> #4ade80`
- Texte fonce : `#1a0a22` ou `#2a1540`
- Texte secondaire : `#6a5a7a` ou `#4a3a5a`

### Style Neumorphism (cartes tarifs/etapes)
- Fond : `linear-gradient(145deg, #f5eaf9, #ecdaf3)` ou vers blanc
- Panel : `linear-gradient(160deg, #f0dff5, #e8d4f0, #f2e6f8)`
- Shadows : `inset 4px 4px 8px rgba(180,140,200,0.15), inset -3px -3px 6px rgba(255,255,255,0.7), 4px 4px 12px rgba(180,140,200,0.12), -3px -3px 8px rgba(255,255,255,0.6)`
- Bordure neon : `1.5px solid rgba(COLOR,0.4)` + glow `0 0 12px rgba(COLOR,0.15), 0 0 30px rgba(COLOR,0.08)`
- Hover : border-color a 0.7 + glow intensifie

### Style Glassmorphism (carte tarifs gauche)
- `backdrop-filter: blur(20px)`
- `background: rgba(255,255,255,0.75)` avec gradient
- `border: 1.5px solid rgba(229,25,129,0.12)`
- Shimmer anime en top bar

### Boutons CTA
- `linear-gradient(135deg, #E51981, #ff3fac)` + blanc
- Shine hover : `::before` gradient blanc translateX(-100% -> 100%)
- Border-radius: 50px
- Box-shadow: `0 4px 20px rgba(229,25,129,0.3)`

---

## Bugs resolus

### Page home
- Mobile menu bloquait tous les touch events (fix: pointer-events)
- Contenu demo dans public/sections/ (fix: build depuis previews/)
- body overflow-x:hidden bloque swipe iOS (fix: overflow par section)
- Carte-france PNG 4-bit (fix: reconvertie RGBA 8-bit)

### Page location-photobooth
- Images bornes 404 (fix: commit photos locales dans public/images/bornes/)
- Fond sombre rejete par user (fix: pastel gradient)
- Watermarks ecrasees par texte (fix: position bottom puis top avec opacity 0.08)
- Chiffres tarifs pas assez visibles (fix: opacity montee a 0.35)

### Admin edition images (11 mars 2026)
- Mauvais fichier preview modifie : readdir Linux non-alphabetique, intro-v3 au lieu de intro (fix: filtrer par pageSections)
- Meme image dans 2 sections : serveur modifiait le 1er fichier trouve (fix: envoyer section, cibler section.html)
- Upload silencieux : file picker volait le focus, activeEl null (fix: sauvegarder uploadTarget avant dialogue)
- Image uploadee invisible : cache 365j servait ancienne version (fix: cache-busting ?v=timestamp dans HTML)
- uploads_tmp manquant dans Docker : multer ne cree pas le dossier (fix: creation auto au demarrage)

---

## Prochaines etapes
- [ ] Ajouter module stats sur location-photobooth ?
- [ ] Module carte-france sur location-photobooth ?
- [ ] Optimisation images (WebP, lazy loading verifie)
- [ ] Tests mobile complets sur location-photobooth
- [ ] SEO : hierarchie H1/H2, meta descriptions, alt texts
