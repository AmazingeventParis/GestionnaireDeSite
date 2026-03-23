# SEO Guidelines — Shootnbox

> Regles SEO appliquees automatiquement par le gestionnaire de site.
> Chaque page construite par `build.js` doit respecter ces directives.

---

## 1. BALISES META — REGLES PAR PAGE

### Title `<title>`

| Regle | Valeur |
|-------|--------|
| Longueur | 50-60 caracteres max |
| Format page interieure | `{Mot-cle principal} \| Shootnbox — {Complement}` |
| Format homepage | `Shootnbox - Location Photobooth & Borne Photo Paris \| Evenements` |
| Format blog | `{Titre article} — Blog Shootnbox` |
| Format page ville | `Location Photobooth {Ville} \| Shootnbox` |
| Mot-cle | En premier dans le titre |
| Unicite | Chaque page a un titre unique — aucun doublon |

### Meta Description

| Regle | Valeur |
|-------|--------|
| Longueur | 150-160 caracteres |
| Contenu | Mot-cle principal + CTA ("Decouvrez", "Demandez votre devis") |
| Unicite | Unique par page |
| Interdit | Pas de guillemets doubles (casse le SERP) |

### URL Canonique

- Chaque page a un `<link rel="canonical">` pointant vers elle-meme
- Format : `https://shootnbox.fr/{slug}/`
- Pas de parametres dans le canonical

### Open Graph

Chaque page doit avoir :
```html
<meta property="og:title" content="Titre pour partage social">
<meta property="og:description" content="Description social">
<meta property="og:url" content="https://shootnbox.fr/page/">
<meta property="og:site_name" content="Shootnbox">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:image" content="/images/og-page.jpg"> <!-- 1200x630px -->
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

### Twitter Cards

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Titre">
<meta name="twitter:description" content="Description">
<meta name="twitter:image" content="/images/og-page.jpg">
```

---

## 2. STRUCTURE HEADINGS — HIERARCHIE STRICTE

- **Un seul `<h1>` par page** — contient le mot-cle principal
- **Hierarchie respectee** : h1 → h2 → h3 (jamais de saut h1 → h3)
- **h2** contiennent les mots-cles secondaires/LSI
- **Pas de heading pour du styling** — utiliser des classes CSS
- **Pas de heading vide** — "Section 1" interdit

### Structure type par page

#### Homepage
```
h1: Location Photobooth & Borne Photo pour vos Evenements
  h2: Nos bornes photo
  h2: Shootnbox en chiffres
  h2: Ce que disent nos clients
  h2: Notre equipe
  h2: Notre savoir-faire
  h2: Le mur de souvenirs
  h2: Zone d'intervention
  h2: Le Shootnblog
```

#### Page Service (Location Photobooth)
```
h1: Location de Photobooth a Paris et en Ile-de-France
  h2: Un photobooth, c'est quoi ?
  h2: Nos bornes photo
    h3: Borne Ring / Vegas / Miroir / Spinner
  h2: Ce que disent nos clients
  h2: Un photobooth pour chaque occasion
  h2: Notre service cle en main
  h2: Fabrique en France
  h2: Shootnbox vs la concurrence
  h2: Notre zone de couverture
  h2: Questions frequentes
  h2: Le Shootnblog
```

#### Page Ville
```
h1: Location Photobooth {Ville} — Borne Photo pour vos Evenements
  h2: Location de photobooth a {Ville}
  h2: Nos bornes disponibles a {Ville}
  h2: Lieux d'evenements a {Ville}
  h2: Temoignages d'evenements a {Ville}
  h2: Questions frequentes
  h2: Demandez votre devis
```

---

## 3. MOTS-CLES CIBLES PAR PAGE

| Page | Mot-cle principal | Mots-cles secondaires |
|------|-------------------|----------------------|
| Homepage | location photobooth evenement | photobooth mariage, borne photo paris, videobooth |
| Location Photobooth | location photobooth paris | photobooth mariage, photobooth entreprise, borne photo |
| Location Entreprise | photobooth entreprise | borne photo seminaire, team building, soiree corporate |
| Page ville X | photobooth {ville} | location borne photo {ville}, animation {ville} |
| Blog | blog photobooth | animation mariage, idees evenement |

### Regles de densite

- 1-2% de densite naturelle — pas de keyword stuffing
- Mot-cle principal dans les 100 premiers mots
- Variantes LSI/semantiques reparties naturellement
- Format question/reponse pour cibler les featured snippets

---

## 4. CONTENU — REGLES E-E-A-T

- **Longueur pages services** : 800-1200 mots de contenu utile
- **Longueur pages villes** : 600-1000 mots avec contenu unique localise
- **Longueur articles blog** : 1500-2500 mots pour les pillar pages
- **Photos reelles** — pas de stock generique
- **Temoignages verifiables** — nom, entreprise/evenement, date
- **Donnees chiffrees** — prix, zones, capacites (pour le GEO/IA)

---

## 5. MAILLAGE INTERNE

- Chaque page a **3-5 liens internes minimum**
- **Ancres descriptives** : "location photobooth mariage Paris" et non "cliquez ici"
- **Pas de page orpheline** : accessible en ≤ 3 clics depuis la homepage
- **Liens reciproques** : pages services ↔ pages villes ↔ blog
- **Footer riche** : liens vers sections principales + villes strategiques
- **Breadcrumbs** sur toutes les pages sauf homepage

---

## 6. IMAGES SEO

- **Chaque `<img>` a un `alt` descriptif** : "Photobooth Shootnbox lors d'un mariage au Chateau de Versailles"
- **Pas d'alt vide** sur les images informatives (`alt=""` reserve aux images decoratives)
- **Pas de "image de"** en prefixe
- **Inclure le mot-cle** quand c'est naturel
- **Noms de fichiers descriptifs** : `photobooth-mariage-paris.webp` et non `IMG_4523.webp`

---

## 7. DONNEES STRUCTUREES SCHEMA.ORG

### Sur toutes les pages — LocalBusiness

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://shootnbox.fr/#organization",
  "name": "Shootnbox",
  "alternateName": "Shoot'n'Box",
  "url": "https://shootnbox.fr",
  "logo": "https://shootnbox.fr/images/logo/shootnbox-logo-new-1.webp",
  "description": "Location de photobooth et borne photo pour mariages, evenements d'entreprise et soirees en Ile-de-France et partout en France.",
  "telephone": "+33145016666",
  "email": "contact@shootnbox.fr",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Paris",
    "addressRegion": "Ile-de-France",
    "addressCountry": "FR"
  },
  "areaServed": {
    "@type": "Country",
    "name": "France"
  },
  "priceRange": "€€",
  "sameAs": [
    "https://www.instagram.com/shootnbox/",
    "https://www.facebook.com/shootnbox",
    "https://www.tiktok.com/@shootnbox",
    "https://www.youtube.com/@shootnbox"
  ]
}
```

### Pages services — Service

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Location de Photobooth",
  "serviceType": "Photo Booth Rental",
  "provider": { "@id": "https://shootnbox.fr/#organization" },
  "areaServed": { "@type": "Country", "name": "France" },
  "description": "Location de borne photo professionnelle pour mariages et evenements."
}
```

### Pages avec FAQ — FAQPage

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Combien coute la location d'un photobooth ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Reponse complete..."
      }
    }
  ]
}
```

### Breadcrumbs — BreadcrumbList

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://shootnbox.fr/" },
    { "@type": "ListItem", "position": 2, "name": "Location Photobooth", "item": "https://shootnbox.fr/location-photobooth/" }
  ]
}
```

### Blog — Article

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Titre de l'article",
  "datePublished": "2026-01-15",
  "dateModified": "2026-01-20",
  "author": { "@type": "Organization", "name": "Shootnbox" },
  "publisher": { "@id": "https://shootnbox.fr/#organization" }
}
```

---

## 8. SEO LOCAL — PAGES VILLES

### Villes prioritaires (Tier 1)
Paris, Boulogne-Billancourt, Neuilly-sur-Seine, Versailles, Montreuil, Vincennes, Nanterre, La Defense

### Villes secondaires (Tier 2)
Communes majeures des departements 92, 94, 93, 78, 91, 95

### Contenu unique obligatoire par page ville
- Paragraphe d'introduction mentionnant la ville et ses specificites
- Lieux emblematiques de la ville pour des evenements
- Temoignages locaux (si disponibles)
- Distance/temps de trajet
- FAQ locale
- CTA avec mention de la ville
- **Minimum 60% de contenu unique** entre les pages villes

---

## 9. GEO — OPTIMISATION POUR LES IA

Le site doit etre lisible par les moteurs de reponse IA (ChatGPT, Perplexity, Google AI).

- **Contenu factuel et structure** : reponses claires, factuelles
- **Format question/reponse** : FAQ naturelles dans chaque page
- **Donnees chiffrees** : prix, zones d'intervention, nombre d'evenements
- **Phrases "citation-worthy"** : claires, avec statistiques, definitions
- **Premiere personne d'autorite** : "Nous intervenons sur plus de X evenements par an"

---

## 10. SITEMAP & ROBOTS

### Sitemap XML
- Genere automatiquement par `/api/seo/sitemap`
- Inclut toutes les pages publiees avec `lastmod` et `priority`
- Soumis dans Google Search Console

### Robots.txt
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: https://shootnbox.fr/sitemap.xml
```

---

## 11. REDIRECTIONS WORDPRESS

Quand le site migrera de WordPress vers le domaine shootnbox.fr :

| Ancienne URL | Nouvelle URL | Type |
|-------------|-------------|------|
| `/accueil` | `/` | 301 |
| `/nos-services` | `/location-photobooth/` | 301 |
| `/nos-tarifs` | `/tarifs/` | 301 |
| `/contactez-nous` | `/contact/` | 301 |
| `/notre-blog` | `/blog/` | 301 |
| `/category/*` | `/blog/` | 301 |
| `/tag/*` | `/blog/` | 301 |
| `/wp-admin/*` | `/` | 301 |
| `/wp-content/*` | `/` | 301 |
| `/wp-login.php` | `/` | 301 |
