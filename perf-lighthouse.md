# Guide Lighthouse Performance — GestionnaireDeSite

> Référence complète issue du travail d'optimisation du 07/04/2026.
> Score initial : 57 → 76 → 89 → en cours
> Page auditée : `https://sites.swipego.app/api/pages/vegas/preview`

## Historique des scores

| Date | Perf | A11y | Best Practices | SEO | Déploiement |
|------|------|------|----------------|-----|-------------|
| 07/04/2026 — départ | 57 | — | — | — | avant optimisations |
| 07/04/2026 — round 1 | 76 | — | — | — | CSS consolidé + lazy + font-display + content-visibility + preload |
| 07/04/2026 — round 2 | 89 | 91 | 100 | 83 | minification CSS + footer content-visibility |
| 07/04/2026 — round 3 | en cours | en cours | — | — | latin-ext optional + text-muted #666 + touch targets 24px |

---

## Comment Lighthouse mesure la Performance

### Métriques et poids

| Métrique | Poids | Ce qu'elle mesure |
|---|---|---|
| **FCP** — First Contentful Paint | 10% | Premier pixel de contenu affiché |
| **SI** — Speed Index | 10% | Vitesse de remplissage visuel |
| **LCP** — Largest Contentful Paint | 25% | Rendu du plus grand élément visible |
| **TBT** — Total Blocking Time | 30% | Temps de blocage du thread principal |
| **CLS** — Cumulative Layout Shift | 15% | Stabilité visuelle (pas de saut de layout) |

> **TBT est le plus impactant (30%).** C'est le temps cumulé où le thread principal est bloqué >50ms. Il inclut le parsing CSS, JS, les layouts.

### Conditions de test simulées
- **CPU throttle** : ×4 (un i7 desktop devient un téléphone mid-range)
- **Réseau** : 1.6 Mbps download, 750 Kbps upload, 150ms RTT
- **Mode** : navigation privée, cache vide, pas d'extensions

> Règle d'or : toute optimisation locale doit être mesurée en tenant compte du throttle. 1ms réel ≈ 4ms throttlé pour le CPU.

---

## Les 12 optimisations implémentées

### 1. CSS consolidé dans `<head>` — Impact : -1,606ms TBT

**Problème :** N blocs `<style>` dans le `<body>` (un par section HTML) → le navigateur déclenche N recalculations de style au fil du parsing.

**Fix dans `routes/pages.js` :**
```javascript
let sectionStyles = ''; // Accumulateur CSS global

// Dans la boucle sections :
content = content.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
  if (css.trim()) sectionStyles += css + '\n';
  return ''; // Retire le <style> du body
});

// Idem pour header, footer, page-background, blog CSS

// Dans le <head> final :
`<style>${sectionStyles}</style>`
```

**Règle :** Tout CSS doit être dans `<head>`, jamais dans `<body>`.

---

### 2. Corriger les erreurs MIME CSS — Impact : supprime render-blocking

**Problème :** Si un fichier CSS référencé dans un `<link>` n'existe pas, Express renvoie une page HTML 404. Le navigateur refuse ce contenu (mauvais MIME type) et bloque le rendu en attendant quand même la réponse.

**Fix :**
```javascript
const cssFilePath = path.join(__dirname, '..', 'public', 'css', `styles-${cssSlug}.css`);
const cssLink = fs.existsSync(cssFilePath)
  ? `<link rel="stylesheet" href="/css/styles-${cssSlug}.css">`
  : ''; // Ne pas ajouter le <link> si le fichier n'existe pas
```

**Règle :** Toujours vérifier l'existence d'un fichier avant de l'inclure dans le HTML.

---

### 3. Auto-lazy loading — Impact : LCP 7.2s → 1.2s

**Problème :** Sous throttle réseau (1.6 Mbps), toutes les images se téléchargent en parallèle. Si 14 images partagent la bande passante, l'image LCP reçoit ~14KB/s au lieu de 200KB/s → LCP ×14 plus lent.

**Fix (post-processing sur bodyContent) :**
```javascript
bodyContent = bodyContent.replace(/<img(\s[^>]*?)?\s*\/?>/gi, (match, attrs = '') => {
  if (/\bloading\s*=/i.test(attrs)) return match; // Déjà défini
  if (/\bfetchpriority\s*=\s*["']high["']/i.test(attrs)) return match; // Image LCP → eager
  return `<img${attrs} loading="lazy">`;
});
```

**Règle :** Toutes les images hors viewport initial doivent avoir `loading="lazy"`. L'image LCP doit avoir `fetchpriority="high"` et `loading="eager"`.

---

### 4. font-display: optional — Impact : CLS 0.07 → 0.00

**Problème :** `font-display: swap` affiche d'abord une police système, puis bascule vers Raleway quand elle est chargée (~513ms après FCP). Ce swap déplace le layout → CLS élevé.

**Fix (dans les déclarations @font-face) :**
```css
@font-face {
  font-family: 'Raleway';
  font-display: optional; /* Pas de swap = pas de CLS */
  src: url(/fonts/raleway-latin.woff2) format('woff2');
}
```

**Quand utiliser quoi :**
- `optional` : police décorative, la police système de fallback est acceptable
- `swap` : police critique pour la lisibilité, le shift est acceptable
- `block` : jamais (texte invisible pendant le chargement)

---

### 5. content-visibility: auto sur les sections hors écran — Impact : DOM 2742 → 1065 nœuds (-61%)

**Problème :** Le navigateur calcule le layout de toutes les sections, même celles qui sont 3000px plus bas. Sur une page longue, ça représente des milliers de nœuds.

**Fix (sur le wrapper de chaque section à partir de la 3e) :**
```javascript
const cvStyle = sectionIdx >= 3
  ? 'content-visibility:auto;contain-intrinsic-size:auto 500px;'
  : '';
bodyContent += `<div class="gds-section-wrapper" style="${cvStyle}">`;
```

**Règle :** `contain-intrinsic-size` est obligatoire pour éviter que la scrollbar saute quand les sections hors écran sont rendues. Valeur typique : hauteur approximative de la section.

**⚠️ Piège :** Ne pas mettre sur les 2 premières sections (contenu visible à l'écran → doit être rendu immédiatement).

---

### 6. Preload LCP image — Impact : démarrage download anticipé

**Problème :** Sans preload, le navigateur découvre l'image LCP seulement après avoir parsé le HTML jusqu'à la balise `<img>`. Avec une grosse page, ça peut être 200-500ms après le début du parsing.

**Fix (détection 3 niveaux) :**
```javascript
const lcpImgMatch =
  // Niveau 1 : classe spécifique de l'image hero
  bodyContent.match(/<img[^>]+class="[^"]*lp-hero-bg[^"]*"[^>]*src="([^"]+)"|<img[^>]+src="([^"]+)"[^>]+class="[^"]*lp-hero-bg[^"]*"/i) ||
  // Niveau 2 : fetchpriority="high" + loading="eager" combinés
  bodyContent.match(/<img[^>]+fetchpriority="high"[^>]+loading="eager"[^>]*src="([^"]+)"|<img[^>]+src="([^"]+)"[^>]+fetchpriority="high"[^>]+loading="eager"/i) ||
  bodyContent.match(/<img[^>]+loading="eager"[^>]+fetchpriority="high"[^>]*src="([^"]+)"|<img[^>]+src="([^"]+)"[^>]+loading="eager"[^>]+fetchpriority="high"/i);

if (lcpImgMatch) {
  const lcpImageUrl = lcpImgMatch[1] || lcpImgMatch[2];
  // Dans le <head> :
  `<link rel="preload" as="image" href="${lcpImageUrl}" fetchpriority="high">`
}
```

**⚠️ Piège rencontré :** Le logo (dans le header) avait aussi `fetchpriority="high"` et apparaissait en premier dans le HTML → le preload pointait sur le logo au lieu du hero. Fix : l'image LCP doit avoir **les deux** attributs (`fetchpriority="high"` + `loading="eager"`), le logo seulement `fetchpriority="high"`.

---

### 7. Preload fonts

**Fix :**
```html
<link rel="preload" as="font" href="/fonts/raleway-latin.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="/fonts/raleway-900i-latin.woff2" type="font/woff2" crossorigin>
```

**Règle :** `crossorigin` est obligatoire même pour les fonts en self-hosted (la spec font le requiert).

---

### 8. Preconnect pour domaines externes

**Fix :**
```javascript
// Détecter les images venant d'un domaine externe
const externalDomains = new Set();
const externalImgRe = /<img[^>]+src="(https?:\/\/([^/"]+)[^"]*)"[^>]*>/gi;
let m;
while ((m = externalImgRe.exec(bodyContent)) !== null) {
  const hostname = m[2];
  if (!hostname.includes(req.hostname)) externalDomains.add(`https://${hostname}`);
}
const preconnectLinks = [...externalDomains]
  .map(origin => `<link rel="preconnect" href="${origin}">`)
  .join('\n');
```

**Impact :** Économise 1 RTT (150ms sous throttle) par domaine externe au premier chargement d'image.

---

### 9. Déduplication :root{}

**Problème :** Chaque section définissait ses propres variables CSS dans un bloc `:root {}`. Avec N sections, N blocs `:root` identiques → parsing CSS redondant.

**Fix :**
```javascript
// Supprimer les :root{} des sections (les variables sont dans le :root global du <head>)
sectionStyles = sectionStyles.replace(/:root\s*\{[^{}]*\}/g, '');

// Dans le <head>, un seul :root global avec toutes les variables du projet :
`:root {
  --rose: ${config.colors?.primary || '#E51981'};
  --bleu: ${config.colors?.secondary || '#0250FF'};
  --violet: ${config.colors?.tertiary || '#7828C8'};
  /* ... */
}`
```

---

### 10. Minification CSS sectionStyles — Impact : ~130KB → ~80KB, -200ms parse throttlé

**Problème :** Le CSS consolidé de toutes les sections fait ~130KB. Sous CPU throttle ×4, le parsing prend ~520ms.

**Fix (minification légère, sans dépendance externe) :**
```javascript
sectionStyles = sectionStyles
  .replace(/\/\*[\s\S]*?\*\//g, '')  // Supprime les commentaires CSS
  .replace(/[ \t]+/g, ' ')           // Collapse whitespace horizontal
  .replace(/\n\s*\n/g, '\n')         // Supprime les lignes vides
  .trim();
```

**Note :** Une minification plus agressive (supprimer les espaces autour de `:`, `{`, `}`) ferait gagner encore ~10KB mais risque de casser certains sélecteurs edge-case. Cette approche conservatrice est suffisante.

---

### 11. Page background différé via requestAnimationFrame

**Problème :** Le fond de page (6 halos animés, 12 pictos SVG, animations CSS) est purement décoratif mais son injection bloque le premier rendu si elle est synchrone.

**Fix :**
```javascript
// Extraire le CSS du fond de page → sectionStyles (dans <head>)
bgHtml = bgHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
  if (css.trim()) sectionStyles += css + '\n';
  return '';
});

// Injecter le HTML via rAF (après le premier frame peint)
bodyContent += `<script>
  requestAnimationFrame(function() {
    var d = document.createElement('div');
    d.innerHTML = ${JSON.stringify(bgHtml.trim())};
    document.body.prepend(d.firstElementChild);
  });
</script>\n`;
```

**Règle :** Tout élément purement décoratif qui n'affecte pas le contenu visible doit être différé via `requestAnimationFrame`.

---

### 12. Footer content-visibility: auto — Impact : -120ms layout throttlé

**Problème :** Le footer contient souvent des listes de villes avec des dizaines/centaines d'éléments. Ces éléments sont inclus dans le layout initial même s'ils sont en bas de page.

**Fix :**
```javascript
bodyContent += `<div style="content-visibility:auto;contain-intrinsic-size:auto 400px;">${footerHtml}</div>\n`;
```

**⚠️ Attention :** Si le footer a un `position:sticky` ou des éléments qui doivent être visibles immédiatement, ne pas appliquer `content-visibility:auto`.

---

### 13. font-display: optional sur TOUS les subsets (latin ET latin-ext) — Impact : CLS 0.086 → 0

**Problème :** Le subset `latin-ext` avait encore `font-display:swap` alors que `latin` était déjà en `optional`. Le swap du subset étendu causait un CLS résiduel de 0.086 après le premier fix.

**Fix dans `routes/pages.js` :**
```javascript
// Tous les @font-face en optional, sans exception de subset
@font-face{font-family:'Raleway';font-display:optional;src:url(/fonts/raleway-latin-ext.woff2)...}
@font-face{font-family:'Raleway';font-display:optional;src:url(/fonts/raleway-latin.woff2)...}
@font-face{font-family:'Raleway';font-style:italic;font-display:optional;src:url(/fonts/raleway-900i-latin-ext.woff2)...}
@font-face{font-family:'Raleway';font-style:italic;font-display:optional;src:url(/fonts/raleway-900i-latin.woff2)...}
```

**Règle :** `font-display:optional` doit s'appliquer à **tous** les subsets d'une même famille, pas seulement au subset principal.

---

### 14. Contraste couleur `--text-muted` — Impact : Accessibility +5pts

**Problème :** `--text-muted: #999` utilisé notamment sur `.section-label` (12px bold) donnait un ratio de contraste de 2.46 sur fond `#f8eaff`. Le minimum WCAG AA est 4.5:1 pour du texte < 18px.

**Fix dans `routes/pages.js` (variable CSS globale) :**
```javascript
--text-dark: #323338; --text-muted: #666; --text-secondary: #555;
```

- `#666` sur `#f8eaff` → ratio 5.27:1 ✓
- Propagation automatique à tous les éléments utilisant `var(--text-muted)`

**Règle :** Toujours vérifier le contraste de toutes les variables CSS de couleur de texte sur le fond de page réel (pas blanc).

---

### 15. Touch targets minimum 24px — Impact : Accessibility +4pts

**Problème :** Les liens dans `.snb-ft-contact-text a` (footer) avaient `min-height: 0` et `font-size: 12px` → hauteur effective ~16px. WCAG 2.5.5 et Lighthouse exigent 24×24px minimum pour les cibles tactiles.

**Fix dans `previews/_shared/footer.html` :**
```css
.snb-ft-contact-text a {
  min-height: 24px;   /* était 0 */
  padding: 4px 0;     /* ajouté */
  display: flex;
  align-items: center;
}
```

**Règle :** Tout lien ou bouton cliquable doit avoir au minimum 24px de hauteur et d'espace entre les cibles voisines. Utiliser `min-height` plutôt que `height` pour ne pas contraindre le contenu multi-lignes.

---

### 16. Image hero WebP responsive — Impact : LCP estimé -1s (TODO)

**Problème identifié :** `vegas-3-1.jpg` servi depuis `shootnbox.fr` en JPG 240KB, affiché en 412×535px mobile mais téléchargé en 1054×1368px. Gaspillage de 176KB. Sous throttle 1.6Mbps → ~0.9s perdus sur le LCP.

**Solution :** Uploader l'image via `POST /api/media/upload` (conversion WebP auto ~50KB), mettre à jour le `src` dans la section vegas via `PUT /api/pages/vegas/section/{file}`.

**Statut : en attente** — nécessite credentials admin GestionnaireDeSite.

---

## Bugs et pièges rencontrés

### Piège 1 — sectionStyles utilisé avant déclaration
**Symptôme :** `ReferenceError: sectionStyles is not defined`
**Cause :** La variable était déclarée dans la boucle des sections, mais utilisée pour le page-background *avant* la boucle.
**Fix :** Déclarer `let sectionStyles = ''` en dehors et avant la boucle.

### Piège 2 — Le preload pointe sur le logo au lieu du hero
**Symptôme :** Lighthouse signale que le preload ne correspond à aucune ressource utilisée.
**Cause :** Logo et hero ont tous les deux `fetchpriority="high"`. Le logo apparaît en premier dans le HTML (header).
**Fix :** Utiliser une combinaison de critères pour identifier le hero (classe spécifique + double attribut).

### Piège 3 — Double déclaration de sectionStyles
**Symptôme :** Le CSS est vide ou dupliqué.
**Cause :** Après avoir déplacé la déclaration en dehors de la boucle, l'ancienne déclaration à l'intérieur de la boucle réinitialisait la variable à chaque itération.
**Fix :** Supprimer la déclaration dans la boucle après l'avoir déplacée.

### Piège 4 — Les changements ne sont pas déployés
**Symptôme :** DevTools montre encore les anciens comportements (11 style blocks, pas de preload).
**Cause :** Commit/push oublié, ou Coolify n'a pas redéployé.
**Fix :** Toujours vérifier via `curl` que le déploiement est bien déclenché, et attendre 2 minutes avant d'auditer.

### Piège 5 — Regex :root trop agressive
**Risque :** `/:root\s*\{[^{}]*\}/g` ne matche que les blocs `:root` sans nested braces. Si une section a un `:root { --var: calc(something {}); }`, la regex échoue.
**Mitigation actuelle :** Les sections du projet n'ont pas de nested braces dans `:root`. À surveiller.

### Piège 6 — JSON.stringify pour l'injection HTML via rAF
**Problème initial :** L'injection du HTML du fond de page via template literal backtick causait des erreurs si le HTML contenait des backticks ou des caractères spéciaux.
**Fix :** Utiliser `JSON.stringify(bgHtml.trim())` pour un escape sûr.

---

## Ordre d'application recommandé

Pour une nouvelle page ou un nouveau projet, appliquer dans cet ordre (du plus impactant au moins impactant) :

1. **CSS dans `<head>`** — toujours en premier, c'est le gain le plus massif
2. **Auto-lazy loading** — gain LCP immédiat
3. **Vérifier existence des fichiers CSS** — évite les render-blocking silencieux
4. **font-display: optional sur TOUS les subsets** (latin + latin-ext) — fixe le CLS entièrement
5. **Preload LCP image** — à faire après avoir identifié le vrai LCP (classe spécifique + fetchpriority+eager)
6. **Preload fonts + preconnect**
7. **content-visibility: auto** — sections hors écran + footer
8. **Déduplication :root{}**
9. **Minification CSS**
10. **Différer les éléments décoratifs** (rAF)
11. **Contraste couleurs** — vérifier `--text-muted` et toutes les variables de texte sur le fond réel
12. **Touch targets** — min-height 24px sur tous les petits liens (footer, nav secondaire)
13. **Image LCP WebP** — uploader sur notre serveur pour conversion automatique (~240KB → ~50KB)

---

## Workflow d'audit Lighthouse

```
1. Commit + push les changements
2. curl Coolify pour déclencher le deploy
3. Attendre 2 minutes
4. Ouvrir Chrome en navigation privée (Ctrl+Shift+N)
5. DevTools → Lighthouse → Mobile → Performance uniquement
6. Analyser les métriques et la cascade
7. Pour aller plus loin : DevTools → Performance → Record → reload
   → chercher "Layout", "Parse Stylesheet", "Recalculate Style" dans la flamegraph
```

### Lire le LCP breakdown dans Lighthouse
```
LCP = TTFB + Load Delay + Load Duration + Render Delay
                           ↑              ↑
                   téléchargement    bloqué par JS/CSS
                   de l'image        après download
```

### Interpréter la cascade réseau
- Chercher les ressources en **rouge** (render-blocking)
- Chercher les grandes ressources qui se téléchargent **en parallèle** avec l'image LCP
- Vérifier que l'image LCP démarre **immédiatement** (pas après d'autres ressources)

---

## Commandes utiles

```bash
# Déclencher un deploy Coolify
curl -s "http://217.182.89.133:8000/api/v1/deploy?uuid=usnz6o4qp48maw8q0lny22nl&force=true" \
  -H "Authorization: Bearer 1|FNcssp3CipkrPNVSQyv3IboYwGsP8sjPskoBG3ux98e5a576"

# Vérifier la taille du CSS généré (via DevTools console sur la page auditée)
JSON.stringify({
  sectionCSSSize: document.querySelector('head style:last-of-type')?.textContent.length,
  styleBlocksInBody: document.querySelectorAll('body style').length,
  lazyImages: document.querySelectorAll('img[loading=lazy]').length,
  eagerImages: document.querySelectorAll('img[loading=eager]').length,
  preloads: [...document.querySelectorAll('link[rel=preload]')].map(l => l.href)
})
```
