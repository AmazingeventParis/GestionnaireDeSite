# CAHIER DES CHARGES TECHNIQUE — Refonte Shootnbox.fr

> **Document de référence technique pour Claude Code (VS Code)**
> Version : 1.0 — Mars 2026
> Projet : Refonte complète du site Shootnbox.fr (migration WordPress/Elementor → site custom)
> Déploiement : Serveur dédié OVH + Coolify

---

## TABLE DES MATIÈRES

1. [Architecture & Stack Technique](#1-architecture--stack-technique)
2. [Structure du Projet & Conventions de Code](#2-structure-du-projet--conventions-de-code)
3. [SEO Technique — Fondations](#3-seo-technique--fondations)
4. [SEO On-Page & Contenu Structuré](#4-seo-on-page--contenu-structuré)
5. [Données Structurées & Schema.org](#5-données-structurées--schemaorg)
6. [GEO — Generative Engine Optimization](#6-geo--generative-engine-optimization)
7. [Performance & Core Web Vitals](#7-performance--core-web-vitals)
8. [Gestion des Images & Médias](#8-gestion-des-images--médias)
9. [Sécurité](#9-sécurité)
10. [Accessibilité (a11y)](#10-accessibilité-a11y)
11. [Tracking, Analytics & Mesure](#11-tracking-analytics--mesure)
12. [RGPD & Conformité Légale](#12-rgpd--conformité-légale)
13. [Stratégie de Cache](#13-stratégie-de-cache)
14. [Gestion des Erreurs & Monitoring](#14-gestion-des-erreurs--monitoring)
15. [Déploiement & CI/CD](#15-déploiement--cicd)
16. [DNS, Domaine & Infrastructure Réseau](#16-dns-domaine--infrastructure-réseau)
17. [Emails & Délivrabilité](#17-emails--délivrabilité)
18. [Social Media & Partage](#18-social-media--partage)
19. [PWA & Mobile](#19-pwa--mobile)
20. [Tests & Qualité](#20-tests--qualité)
21. [Internationalisation (i18n)](#21-internationalisation-i18n)
22. [SEO Local & Pages Villes](#22-seo-local--pages-villes)
23. [Redirections & Migration](#23-redirections--migration)
24. [Checklist Pré-Production](#24-checklist-pré-production)

---

## 1. ARCHITECTURE & STACK TECHNIQUE

### 1.1 Choix du Framework

- **Framework front** : Next.js (App Router) avec React Server Components (RSC)
  - Justification : SSR/SSG natif, optimisation SEO intégrée, streaming, image optimization, route handlers API
  - Version minimale : Next.js 14+ (App Router stable)
- **Alternative acceptée** : Astro (si site principalement statique/contenu) — à valider avant dev
- **Langage** : TypeScript strict (`"strict": true` dans tsconfig)
- **Styling** : Tailwind CSS 4+ (utility-first, purge automatique, pas de CSS inutilisé en prod)
- **Composants UI** : Shadcn/UI comme base (accessible, composable, pas de dépendance runtime lourde)

### 1.2 Backend & API

- **API Routes** : Next.js Route Handlers (`/app/api/...`)
- **Base de données** : Supabase (PostgreSQL) pour :
  - Formulaires de contact / demandes de devis
  - Gestion des avis / témoignages
  - Données dynamiques (galeries événements, etc.)
  - Analytics internes si nécessaire
- **CMS pour le contenu** : Headless — deux options :
  - Option A : Markdown/MDX dans le repo (pour le blog, pages villes) — **recommandé pour le contrôle SEO total**
  - Option B : Supabase comme mini-CMS avec interface admin custom
- **Authentification admin** : Supabase Auth (si interface admin nécessaire)

### 1.3 Infrastructure

- **Serveur** : OVH dédié existant
- **Orchestration** : Coolify (déploiement automatisé depuis GitHub)
- **Reverse proxy** : Traefik (via Coolify) ou Caddy
- **SSL** : Let's Encrypt automatique via Coolify/Traefik
- **CDN** : Cloudflare (gratuit) — DNS proxy + cache + protection DDoS
- **Domaine** : shootnbox.fr (+ variantes : shootnbox.com si détenu)

### 1.4 Contraintes d'Architecture

- **Zéro dépendance inutile** : chaque `npm install` doit être justifié
- **Bundle size** : surveiller avec `@next/bundle-analyzer` — budget max 150kB First Load JS
- **Pas de client-side rendering pour le contenu SEO** : tout contenu indexable doit être SSR ou SSG
- **Pas de SPA pour les pages publiques** : navigation classique avec prefetch, pas de shell SPA
- **API : pas de données sensibles exposées côté client** : les clés API sont exclusivement dans les variables d'environnement serveur

---

## 2. STRUCTURE DU PROJET & CONVENTIONS DE CODE

### 2.1 Arborescence du Projet

```
shootnbox/
├── app/                          # App Router Next.js
│   ├── (marketing)/              # Groupe de routes publiques
│   │   ├── page.tsx              # Homepage
│   │   ├── layout.tsx            # Layout marketing
│   │   ├── photobooth/
│   │   │   └── page.tsx
│   │   ├── videobooth/
│   │   │   └── page.tsx
│   │   ├── tarifs/
│   │   │   └── page.tsx
│   │   ├── contact/
│   │   │   └── page.tsx
│   │   ├── blog/
│   │   │   ├── page.tsx          # Liste articles
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # Article unique
│   │   ├── villes/               # Pages SEO locales
│   │   │   └── [ville]/
│   │   │       └── page.tsx
│   │   └── realisations/
│   │       ├── page.tsx
│   │       └── [slug]/
│   │           └── page.tsx
│   ├── api/                      # Route Handlers
│   │   ├── contact/
│   │   │   └── route.ts
│   │   ├── revalidate/
│   │   │   └── route.ts
│   │   └── sitemap/
│   │       └── route.ts
│   ├── layout.tsx                # Root layout
│   ├── not-found.tsx             # Page 404 custom
│   ├── error.tsx                 # Error boundary global
│   ├── robots.ts                 # Génération dynamique robots.txt
│   ├── sitemap.ts                # Génération dynamique sitemap.xml
│   └── manifest.ts               # Web App Manifest
├── components/
│   ├── ui/                       # Composants Shadcn/UI
│   ├── layout/                   # Header, Footer, Navigation
│   ├── sections/                 # Sections de page réutilisables
│   ├── forms/                    # Composants formulaires
│   ├── seo/                      # JsonLd, BreadcrumbNav, MetaTags
│   └── shared/                   # Composants partagés
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Client côté client
│   │   ├── server.ts             # Client côté serveur
│   │   └── types.ts              # Types générés
│   ├── seo/
│   │   ├── metadata.ts           # Fonctions de génération metadata
│   │   ├── jsonld.ts             # Générateurs Schema.org
│   │   └── constants.ts          # Constantes SEO (titres, descriptions)
│   ├── utils/
│   │   ├── cn.ts                 # Utilitaire classnames
│   │   ├── format.ts             # Formatage dates, prix, etc.
│   │   └── validation.ts         # Schemas Zod
│   └── config/
│       ├── site.ts               # Configuration globale du site
│       ├── navigation.ts         # Structure de navigation
│       └── cities.ts             # Données villes pour pages locales
├── content/
│   ├── blog/                     # Articles MDX
│   └── pages/                    # Contenu des pages statiques
├── public/
│   ├── images/                   # Images statiques optimisées
│   ├── fonts/                    # Polices auto-hébergées
│   ├── icons/                    # Favicons, app icons
│   └── og/                       # Images Open Graph pré-générées
├── styles/
│   └── globals.css               # Styles globaux + Tailwind directives
├── types/
│   └── index.ts                  # Types globaux TypeScript
├── scripts/
│   ├── generate-sitemap.ts       # Script de génération sitemap avancé
│   └── optimize-images.ts        # Script d'optimisation batch
├── .env.local                    # Variables d'environnement (dev)
├── .env.production               # Variables d'environnement (prod)
├── next.config.ts                # Configuration Next.js
├── tailwind.config.ts            # Configuration Tailwind
├── tsconfig.json                 # Configuration TypeScript
├── CLAUDE.md                     # Instructions pour Claude Code
└── package.json
```

### 2.2 Conventions de Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichiers composants | PascalCase | `HeroSection.tsx` |
| Fichiers utilitaires | camelCase | `formatDate.ts` |
| Fichiers de config | camelCase | `siteConfig.ts` |
| Dossiers | kebab-case | `hero-section/` |
| Variables CSS | kebab-case préfixé | `--color-primary` |
| Variables d'env | SCREAMING_SNAKE_CASE | `NEXT_PUBLIC_SUPABASE_URL` |
| Types/Interfaces | PascalCase préfixé | `type BlogPost`, `interface SeoMeta` |
| Constantes | SCREAMING_SNAKE_CASE | `MAX_BLOG_POSTS_PER_PAGE` |
| Fonctions | camelCase verbe-nom | `generateMetadata()`, `fetchBlogPosts()` |

### 2.3 Règles de Code Impératives

```typescript
// tsconfig.json — Configuration stricte obligatoire
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

- **Pas de `any`** : chaque variable, paramètre, retour doit être typé
- **Pas de `// @ts-ignore`** : corriger le type, ne pas le masquer
- **Pas de `console.log` en production** : utiliser un logger structuré ou supprimer
- **Pas d'import circulaire** : structure en couches (composants → lib → types)
- **Pas de logique métier dans les composants** : extraire dans `/lib/`
- **Composants < 150 lignes** : au-delà, décomposer
- **Fonctions < 40 lignes** : au-delà, extraire des sous-fonctions
- **Un seul export par fichier composant** : export default pour le composant principal
- **Imports absolus** : utiliser les alias `@/` configurés dans tsconfig
- **Immutabilité** : préférer `const`, spread operator, `.map()` plutôt que mutations

### 2.4 Linting & Formatting

```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "plugin:@typescript-eslint/strict-type-checked"
  ],
  "rules": {
    "no-console": "warn",
    "prefer-const": "error",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "react/no-unescaped-entities": "error",
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal", "parent", "sibling"],
      "newlines-between": "always",
      "alphabetize": { "order": "asc" }
    }]
  }
}
```

```json
// prettier.config.js
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### 2.5 Gestion des Dépendances

**Règle fondamentale : chaque dépendance ajoutée doit être justifiée dans le commit.**

Dépendances autorisées de base :
- `next`, `react`, `react-dom` — framework
- `tailwindcss`, `@tailwindcss/typography` — styling
- `zod` — validation de schemas
- `lucide-react` — icônes (tree-shakable)
- `@supabase/supabase-js` — BDD
- `next-mdx-remote` ou `@next/mdx` — contenu MDX
- `sharp` — optimisation images côté serveur
- `clsx` + `tailwind-merge` — utilitaire classes CSS

Dépendances **interdites** :
- jQuery — inutile
- Moment.js — utiliser `Intl.DateTimeFormat` natif ou `date-fns`
- Lodash complet — importer uniquement les fonctions unitaires si nécessaire
- Tout carousel/slider JS lourd — implémenter en CSS natif (`scroll-snap`)
- Tout polyfill non nécessaire pour les navigateurs modernes
- Font Awesome — utiliser Lucide ou SVGs inline

---

## 3. SEO TECHNIQUE — FONDATIONS

### 3.1 Rendu & Indexabilité

- **Chaque page publique doit être rendue côté serveur (SSR) ou pré-générée (SSG)**
  - Pages statiques (accueil, services, tarifs) → SSG avec `generateStaticParams`
  - Blog → SSG avec ISR (Incremental Static Regeneration), `revalidate: 3600`
  - Pages villes → SSG avec `generateStaticParams` à partir de la liste des villes
- **Aucun contenu SEO derrière du JavaScript client-only** : les robots doivent voir le HTML complet au premier chargement
- **Vérifier l'indexabilité** : chaque page doit être visible dans "View Source" du navigateur avec son contenu complet

### 3.2 URLs & Routing

- **URLs propres et lisibles** : `/photobooth-mariage-paris` et non `/page?id=42`
- **Pas de trailing slash** : configurer dans `next.config.ts` → `trailingSlash: false`
- **Pas de double slash** : vérifier les redirections
- **Tout en minuscules** : rediriger automatiquement les URLs avec majuscules
- **Pas d'underscore** : utiliser des tirets (`-`) uniquement
- **Profondeur max 3 niveaux** : `/blog/categorie/article` maximum
- **URLs en français** : `/photobooth-mariage` et non `/photobooth-wedding`

```typescript
// next.config.ts
const nextConfig = {
  trailingSlash: false,
  async redirects() {
    return [
      // Rediriger les anciennes URLs WordPress
      {
        source: '/:path*/',
        destination: '/:path*',
        permanent: true, // 301
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}
```

### 3.3 Balises Meta — Implémentation Systématique

Chaque page doit exporter une fonction `generateMetadata()` :

```typescript
// Modèle obligatoire pour chaque page
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Titre optimisé | Shootnbox',           // 50-60 caractères
    description: 'Description optimisée pour le CTR', // 150-160 caractères
    alternates: {
      canonical: 'https://www.shootnbox.fr/page',    // URL canonique OBLIGATOIRE
    },
    openGraph: {
      title: 'Titre pour partage social',
      description: 'Description social',
      url: 'https://www.shootnbox.fr/page',
      siteName: 'Shootnbox',
      locale: 'fr_FR',
      type: 'website',                               // ou 'article' pour blog
      images: [
        {
          url: '/og/page-name.jpg',                   // 1200x630px obligatoire
          width: 1200,
          height: 630,
          alt: 'Description alternative de l\'image',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Titre Twitter',
      description: 'Description Twitter',
      images: ['/og/page-name.jpg'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}
```

### 3.4 Titre `<title>` — Règles Strictes

- **Format page intérieure** : `{Mot-clé principal} | Shootnbox — {Complément géo ou spécialisation}`
- **Format homepage** : `Shootnbox — Location Photobooth & Videobooth pour Événements en Île-de-France`
- **Format blog** : `{Titre article} — Blog Shootnbox`
- **Longueur** : 50-60 caractères maximum (vérifier via compteur)
- **Mot-clé principal en premier** dans le titre
- **Chaque page a un titre unique** : aucun doublon autorisé
- **Pas de keyword stuffing** : 1 mot-clé principal + 1 secondaire max

### 3.5 Meta Description — Règles Strictes

- **Longueur** : 150-160 caractères
- **Contient le mot-clé principal** naturellement
- **Contient un CTA** : "Découvrez", "Demandez votre devis", "Réservez"
- **Unique par page** : aucun doublon
- **Pas de guillemets doubles** : casse l'affichage SERP

### 3.6 Balises Heading — Hiérarchie Stricte

- **Un seul `<h1>` par page** : obligatoire, contient le mot-clé principal
- **Hiérarchie respectée** : h1 → h2 → h3 (pas de saut h1 → h3)
- **h2 contiennent les mots-clés secondaires/LSI**
- **Pas de heading pour du styling** : utiliser des classes CSS
- **Pas de heading vide ou non descriptif** : "Section 1" interdit

### 3.7 Liens Internes

- **Maillage interne réfléchi** : chaque page doit avoir 3-5 liens internes minimum
- **Texte d'ancre descriptif** : "location photobooth mariage Paris" et non "cliquez ici"
- **Pas de liens orphelins** : chaque page est accessible en ≤ 3 clics depuis la homepage
- **Breadcrumbs** : sur toutes les pages sauf homepage, avec Schema.org BreadcrumbList
- **Liens réciproques** : pages services ↔ pages villes ↔ blog articles liés
- **Footer riche** : liens vers toutes les sections principales + pages villes stratégiques

### 3.8 Robots.txt

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/_next/',
          '/private/',
        ],
      },
    ],
    sitemap: 'https://www.shootnbox.fr/sitemap.xml',
  }
}
```

### 3.9 Sitemap XML

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.shootnbox.fr'

  // Pages statiques
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/photobooth`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/videobooth`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/tarifs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ]

  // Pages dynamiques — blog
  const blogPosts = await getBlogPosts() // Fonction à implémenter
  const blogPages = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  // Pages villes
  const cities = await getCities() // Fonction à implémenter
  const cityPages = cities.map((city) => ({
    url: `${baseUrl}/villes/${city.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...blogPages, ...cityPages]
}
```

### 3.10 URL Canonique

- **Chaque page a une balise `<link rel="canonical">`** pointant vers elle-même
- **Version préférée** : `https://www.shootnbox.fr/...` (avec www)
- **Redirection 301** : `shootnbox.fr` → `www.shootnbox.fr`
- **Pas de paramètres dans le canonical** : `/blog?page=2` → canonical = `/blog`
- **Pagination** : les pages paginées ont leur propre canonical (`/blog/page/2`)

### 3.11 Hreflang (si multilingue futur)

```html
<!-- Si le site devient multilingue -->
<link rel="alternate" hreflang="fr" href="https://www.shootnbox.fr/" />
<link rel="alternate" hreflang="x-default" href="https://www.shootnbox.fr/" />
```

---

## 4. SEO ON-PAGE & CONTENU STRUCTURÉ

### 4.1 Optimisation du Contenu Textuel

- **Densité de mots-clés** : 1-2% naturellement intégrés — pas de keyword stuffing
- **Longueur minimum des pages services** : 800-1200 mots de contenu utile
- **Longueur articles blog** : 1500-2500 mots pour les pillar pages
- **Longueur pages villes** : 600-1000 mots avec contenu unique et localisé
- **Premier paragraphe** : contient le mot-clé principal dans les 100 premiers mots
- **Mots-clés LSI/sémantiques** : inclure des variantes naturelles (synonymes, questions associées)
- **Questions/réponses intégrées** : format FAQ dans les pages pour cibler les featured snippets

### 4.2 Mots-clés Cibles par Page

| Page | Mot-clé principal | Mots-clés secondaires |
|---|---|---|
| Homepage | location photobooth événement | photobooth mariage, videobooth, île-de-france |
| Photobooth | location photobooth | photobooth mariage, photobooth entreprise, borne photo |
| Videobooth | location videobooth | videobooth événement, borne vidéo, slowmotion |
| Tarifs | tarif location photobooth | prix photobooth, devis photobooth |
| Blog | blog photobooth | animation mariage, idées événement |
| Page ville X | photobooth {ville} | location borne photo {ville}, animation {ville} |

### 4.3 Attributs Alt des Images

- **Chaque image a un `alt` descriptif** : "Photobooth Shootnbox lors d'un mariage au Château de Versailles"
- **Pas d'alt vide** sur les images informatives (alt="" réservé aux images décoratives)
- **Pas de "image de"** en préfixe : décrire directement le contenu
- **Inclure le mot-clé quand c'est naturel** : pas de forcing

### 4.4 Structure de Contenu par Type de Page

#### Homepage
```
h1: Location Photobooth & Videobooth pour vos Événements
  h2: Nos solutions
    h3: Photobooth
    h3: Videobooth
  h2: Pourquoi choisir Shootnbox ?
    h3: Qualité professionnelle
    h3: Installation clé en main
    h3: Personnalisation totale
  h2: Nos dernières réalisations
  h2: Ce que disent nos clients (témoignages)
  h2: Ils nous font confiance (logos clients)
  h2: Questions fréquentes (FAQ)
  h2: Zone d'intervention
```

#### Page Service (Photobooth/Videobooth)
```
h1: Location de Photobooth pour vos Événements
  h2: Comment fonctionne notre photobooth ?
  h2: Nos formules et options
    h3: Formule Essentielle
    h3: Formule Premium
    h3: Options complémentaires
  h2: Galerie de nos événements
  h2: Personnalisation de votre expérience
  h2: Questions fréquentes
  h2: Demandez votre devis
```

### 4.5 Contenu E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)

- **Page "À propos"** : histoire de l'entreprise, équipe, valeurs, chiffres clés
- **Auteurs identifiés** sur les articles blog (nom, bio, photo, liens sociaux)
- **Témoignages vérifiables** : nom, entreprise/événement, date, photo si possible
- **Mentions légales complètes** : SIRET, adresse, contact
- **Certifications / partenariats** : afficher les logos et liens
- **Photos réelles** : pas de photos stock, photos des vrais événements Shootnbox

---

## 5. DONNÉES STRUCTURÉES & SCHEMA.ORG

### 5.1 Schema.org — Implémentation Obligatoire

Chaque type de données structurées doit être injecté en JSON-LD dans le `<head>` via un composant dédié.

```typescript
// components/seo/JsonLd.tsx
type JsonLdProps = {
  data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
```

### 5.2 Schemas Obligatoires par Page

#### Toutes les pages — Organization
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://www.shootnbox.fr/#organization",
  "name": "Shootnbox",
  "alternateName": "Shoot'n'Box",
  "url": "https://www.shootnbox.fr",
  "logo": "https://www.shootnbox.fr/images/logo-shootnbox.png",
  "image": "https://www.shootnbox.fr/images/shootnbox-photobooth.jpg",
  "description": "Location de photobooth et videobooth pour mariages, événements d'entreprise et soirées privées en Île-de-France.",
  "telephone": "+33XXXXXXXXX",
  "email": "contact@shootnbox.fr",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Adresse",
    "addressLocality": "Montreuil",
    "postalCode": "93100",
    "addressRegion": "Île-de-France",
    "addressCountry": "FR"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 48.8611,
    "longitude": 2.4437
  },
  "areaServed": [
    {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": 48.8566,
        "longitude": 2.3522
      },
      "geoRadius": "100000"
    }
  ],
  "priceRange": "€€",
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
    "opens": "09:00",
    "closes": "18:00"
  },
  "sameAs": [
    "https://www.instagram.com/shootnbox",
    "https://www.facebook.com/shootnbox",
    "https://www.tiktok.com/@shootnbox"
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "XX",
    "bestRating": "5"
  }
}
```

#### Pages Services — Service + Offer
```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Location de Photobooth",
  "serviceType": "Photo Booth Rental",
  "provider": { "@id": "https://www.shootnbox.fr/#organization" },
  "areaServed": {
    "@type": "State",
    "name": "Île-de-France"
  },
  "description": "...",
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "XXX",
    "highPrice": "XXX",
    "priceCurrency": "EUR"
  }
}
```

#### Blog — Article + Author
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Titre de l'article",
  "description": "Description",
  "image": "https://www.shootnbox.fr/blog/image.jpg",
  "datePublished": "2026-01-15T08:00:00+01:00",
  "dateModified": "2026-01-20T10:00:00+01:00",
  "author": {
    "@type": "Person",
    "name": "Nom de l'auteur",
    "url": "https://www.shootnbox.fr/auteur/nom"
  },
  "publisher": { "@id": "https://www.shootnbox.fr/#organization" },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://www.shootnbox.fr/blog/slug"
  }
}
```

#### FAQ — FAQPage
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Combien coûte la location d'un photobooth ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Nos tarifs commencent à partir de XXX€..."
      }
    }
  ]
}
```

#### Breadcrumbs — BreadcrumbList
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://www.shootnbox.fr" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.shootnbox.fr/blog" },
    { "@type": "ListItem", "position": 3, "name": "Titre article" }
  ]
}
```

#### Pages Villes — LocalBusiness étendu
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Shootnbox — Location Photobooth à {Ville}",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "{Ville}",
    "addressRegion": "Île-de-France",
    "addressCountry": "FR"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "{lat}",
    "longitude": "{lng}"
  },
  "parentOrganization": { "@id": "https://www.shootnbox.fr/#organization" }
}
```

### 5.3 Validation des Données Structurées

- **Tester chaque schema** avec : https://search.google.com/structured-data/testing-tool
- **Tester avec Rich Results Test** : https://search.google.com/test/rich-results
- **Pas d'erreurs** : 0 erreur, warnings acceptables si justifiés
- **Automatiser la validation** dans les tests CI

---

## 6. GEO — GENERATIVE ENGINE OPTIMIZATION

### 6.1 Principes GEO pour la Visibilité dans les IA

Le site doit être optimisé non seulement pour Google Search mais aussi pour les moteurs de réponse IA (ChatGPT Search, Google AI Overviews, Perplexity, Claude).

- **Contenu factuel et structuré** : les IA privilégient les réponses claires et factuelles
- **Format question/réponse** : intégrer des FAQ naturelles dans chaque page
- **Données chiffrées** : inclure des prix, délais, zones d'intervention, capacités
- **Première personne d'autorité** : "Nous intervenons sur plus de X événements par an"
- **Citations et sources** : lier vers des contenus tiers (études, articles de presse)
- **Contenu "citation-worthy"** : phrases claires, statistiques, définitions que les IA peuvent reprendre

### 6.2 Format de Contenu Optimisé GEO

```markdown
## Combien coûte la location d'un photobooth en Île-de-France ?

Le prix d'une location de photobooth en Île-de-France varie entre XXX€ et XXX€
selon la formule choisie. Chez Shootnbox, nos tarifs incluent :
- L'installation et la désinstallation complète
- Un opérateur professionnel pendant toute la durée
- Les impressions illimitées
- La personnalisation des tirages aux couleurs de l'événement

> Pour un mariage de 100 à 200 invités, la formule recommandée est [XXX]
> au tarif de XXX€ TTC, livraison incluse en Île-de-France.
```

### 6.3 Signaux GEO à Implémenter

- **About page complète** : histoire, équipe, chiffres, distinctions
- **Mentions presse** : page dédiée si applicable
- **Avis structurés** : intégrer les avis Google directement (avec schema AggregateRating)
- **Contenu frais** : publier régulièrement des articles blog (1-2/mois minimum)
- **Liens entrants de qualité** : stratégie de netlinking (annuaires mariages, partenaires)

---

## 7. PERFORMANCE & CORE WEB VITALS

### 7.1 Objectifs de Performance (Seuils Obligatoires)

| Métrique | Seuil "Good" | Objectif Shootnbox |
|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | **≤ 1.8s** |
| **INP** (Interaction to Next Paint) | ≤ 200ms | **≤ 150ms** |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | **≤ 0.05** |
| **FCP** (First Contentful Paint) | ≤ 1.8s | **≤ 1.2s** |
| **TTFB** (Time to First Byte) | ≤ 800ms | **≤ 400ms** |
| **Total Blocking Time** | ≤ 200ms | **≤ 100ms** |
| **PageSpeed Score** (mobile) | 90+ | **95+** |
| **PageSpeed Score** (desktop) | 90+ | **98+** |

### 7.2 Optimisation LCP

- **Identifier l'élément LCP de chaque page** (généralement l'image hero ou le h1)
- **Hero image** : utiliser `<Image priority>` de Next.js (préchargement automatique)
- **Preload l'image LCP** :
  ```html
  <link rel="preload" as="image" href="/images/hero.webp" fetchpriority="high" />
  ```
- **Format images** : WebP (fallback AVIF si support), pas de PNG/JPEG non optimisé
- **Taille images hero** : max 200kB après compression
- **Pas de lazy load sur l'image LCP** : `loading="eager"` + `fetchPriority="high"`
- **Servir l'image depuis le même domaine** (pas de CDN externe pour le LCP)

### 7.3 Optimisation INP

- **Pas de JavaScript bloquant** : tout script non critique en `async` ou `defer`
- **Pas de heavy computation dans le main thread** : utiliser Web Workers si nécessaire
- **Event handlers optimisés** : débouncer les inputs, throttler les scroll handlers
- **Pas de layout thrashing** : lire puis écrire le DOM, pas alterner
- **Réduire la taille du DOM** : max 1500 éléments par page, profondeur max 32 niveaux

### 7.4 Optimisation CLS

- **Toutes les images ont des dimensions explicites** : `width` + `height` sur chaque `<img>` / `<Image>`
- **Pas de contenu injecté au-dessus du fold** après le chargement
- **Polices avec `font-display: swap`** et tailles de fallback identiques (voir section Polices)
- **Réserver l'espace pour les embeds** : iframes, vidéos, maps ont un aspect-ratio défini
- **Pas de banner/popup qui pousse le contenu** : utiliser des overlays

### 7.5 Polices Web — Stratégie Anti-CLS

```typescript
// app/layout.tsx
import localFont from 'next/font/local'
// OU
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
})

// Optionnel : police d'accent/titres
const heading = localFont({
  src: '../public/fonts/heading.woff2',
  display: 'swap',
  variable: '--font-heading',
  preload: true,
})
```

- **Auto-héberger les polices** (pas de Google Fonts externe) : Next.js le fait automatiquement avec `next/font`
- **Formats** : WOFF2 uniquement (support 97%+)
- **Subsetting** : latin uniquement sauf besoin spécifique
- **Max 2 polices** : une pour le texte, une pour les titres (optionnel)
- **Max 4 variantes** : Regular, Medium, SemiBold, Bold — pas plus

### 7.6 JavaScript — Budget & Optimisation

- **Bundle budget** : max 150kB First Load JS (gzipped)
- **Analyser régulièrement** : `ANALYZE=true next build` avec `@next/bundle-analyzer`
- **Code splitting automatique** : Next.js le fait par route — ne pas casser avec des imports globaux
- **Dynamic imports** pour les composants lourds/sous le fold :
  ```typescript
  const HeavyGallery = dynamic(() => import('@/components/Gallery'), {
    loading: () => <GallerySkeleton />,
    ssr: false, // Si pas nécessaire pour le SEO
  })
  ```
- **Tree shaking** : vérifier que les imports sont nommés (`import { X }` et non `import *`)
- **Pas de polyfill inutile** : cibler les navigateurs modernes (ES2020+)

### 7.7 CSS — Optimisation

- **Tailwind purge** : actif par défaut en production — vérifier que toutes les classes dynamiques sont safeguardées
- **CSS critique inline** : Next.js le fait automatiquement pour les CSS modules
- **Pas de CSS inutilisé** : 0 règle non utilisée en production
- **Pas de `@import` en CSS** : utiliser les imports JS/TS
- **Animations** : uniquement `transform` et `opacity` (propriétés compositées, pas de reflow)
- **`will-change`** : utiliser avec parcimonie, uniquement sur les éléments effectivement animés

### 7.8 Préchargement & Resource Hints

```html
<!-- DNS prefetch pour les domaines tiers -->
<link rel="dns-prefetch" href="https://www.googletagmanager.com" />
<link rel="dns-prefetch" href="https://www.google-analytics.com" />

<!-- Preconnect pour les ressources critiques -->
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

<!-- Prefetch des pages probables (navigation) -->
<!-- Next.js le fait automatiquement avec <Link> — ne pas dupliquer -->
```

---

## 8. GESTION DES IMAGES & MÉDIAS

### 8.1 Formats & Compression

| Type | Format | Qualité | Taille max |
|---|---|---|---|
| Photos (hero, galerie) | WebP | 80-85% | 200kB |
| Illustrations/logos | SVG | N/A | 20kB |
| Icônes | SVG inline | N/A | 5kB |
| Thumbnails | WebP | 75% | 50kB |
| OG Images | JPEG | 85% | 100kB |

### 8.2 Composant Image — Règles

```typescript
// Utilisation OBLIGATOIRE du composant Next.js Image
import Image from 'next/image'

// ✅ Correct
<Image
  src="/images/photobooth-mariage.webp"
  alt="Photobooth Shootnbox installé lors d'un mariage"
  width={800}
  height={600}
  quality={85}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..." // Généré au build
/>

// ❌ Interdit
<img src="/images/photo.jpg" />  // Pas de <img> natif
<Image src="/images/photo.png" /> // Pas de PNG pour les photos
```

### 8.3 Responsive Images — Breakpoints

```typescript
// Configuration des tailles responsive
const imageSizes = {
  hero: '(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1200px',
  card: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  thumbnail: '(max-width: 640px) 50vw, 200px',
  fullWidth: '100vw',
}
```

### 8.4 Lazy Loading

- **Au-dessus du fold** : `loading="eager"` + `priority` (hero, logo, premier contenu visible)
- **En dessous du fold** : `loading="lazy"` (par défaut dans Next.js Image)
- **Galeries** : lazy load + intersection observer pour le chargement progressif
- **Vidéos embed** : facade pattern (thumbnail cliquable → chargement iframe)

### 8.5 Vidéos

- **Pas d'autolecture en vidéo lourde** : utiliser une image poster + lecture au clic
- **Vidéos hébergées** : servir en MP4 H.264 + WebM VP9
- **YouTube/Vimeo** : facade pattern obligatoire (économise ~800kB au chargement initial)
  ```typescript
  // Composant YouTube Facade
  const YouTubeFacade = ({ videoId, title }: { videoId: string; title: string }) => {
    const [isLoaded, setIsLoaded] = useState(false)
    if (!isLoaded) {
      return (
        <button onClick={() => setIsLoaded(true)} aria-label={`Lire la vidéo : ${title}`}>
          <Image
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt={title}
            width={640}
            height={360}
          />
          <PlayIcon />
        </button>
      )
    }
    return <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} ... />
  }
  ```

---

## 9. SÉCURITÉ

### 9.1 Headers de Sécurité HTTP

```typescript
// next.config.ts — Headers obligatoires
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        // Empêche le MIME sniffing
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Empêche le clickjacking
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        // Protection XSS (legacy mais utile)
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        // Contrôle du referer
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Permissions API
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        },
        // HSTS — forcer HTTPS
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        // CSP — Content Security Policy
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://www.google-analytics.com https://i.ytimg.com",
            "font-src 'self'",
            "connect-src 'self' https://www.google-analytics.com https://*.supabase.co",
            "frame-src https://www.youtube.com https://www.google.com",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "upgrade-insecure-requests",
          ].join('; '),
        },
      ],
    },
  ]
}
```

### 9.2 Protection des Formulaires

- **Validation côté client ET côté serveur** : Zod pour les deux côtés
  ```typescript
  // lib/validation.ts
  import { z } from 'zod'

  export const contactSchema = z.object({
    name: z.string().min(2, 'Nom trop court').max(100),
    email: z.string().email('Email invalide'),
    phone: z.string().regex(/^(?:\+33|0)[1-9](?:[0-9]{8})$/, 'Numéro invalide').optional(),
    message: z.string().min(10, 'Message trop court').max(5000),
    eventType: z.enum(['mariage', 'entreprise', 'soiree', 'autre']),
    eventDate: z.string().optional(),
    honeypot: z.string().max(0), // Anti-spam : champ invisible
  })
  ```
- **Honeypot** : champ caché en CSS, rejet silencieux si rempli
- **Rate limiting** : max 5 soumissions par IP par heure
  ```typescript
  // Implémentation simple avec Map en mémoire (ou Redis en prod)
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

  function isRateLimited(ip: string): boolean {
    const now = Date.now()
    const entry = rateLimitMap.get(ip)
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 3600000 })
      return false
    }
    entry.count++
    return entry.count > 5
  }
  ```
- **CSRF** : pas nécessaire si les formulaires utilisent des Route Handlers Next.js (SameSite cookies)
- **Sanitisation des entrées** : pas de HTML dans les champs texte
- **Captcha** : hCaptcha ou Turnstile (Cloudflare) en dernier recours — éviter Google reCAPTCHA si possible (RGPD)

### 9.3 Variables d'Environnement

```bash
# .env.local (NE JAMAIS COMMITTER)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co       # Côté client OK
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...                # Côté client OK (RLS actif)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...                     # SERVEUR UNIQUEMENT
SMTP_HOST=smtp.xxx.fr                                    # SERVEUR UNIQUEMENT
SMTP_USER=contact@shootnbox.fr                           # SERVEUR UNIQUEMENT
SMTP_PASS=xxx                                            # SERVEUR UNIQUEMENT
ANALYTICS_ID=G-XXXXXXXXXX                                # Côté client OK
REVALIDATION_SECRET=xxx                                  # SERVEUR UNIQUEMENT
```

**Règles** :
- Préfixe `NEXT_PUBLIC_` = accessible côté client → jamais de secrets
- Sans préfixe = serveur uniquement → API keys, mots de passe, tokens
- `.env.local` dans `.gitignore` : **obligatoire**
- Pas de secret en dur dans le code : **jamais**

### 9.4 Supabase — Row Level Security

- **RLS activé sur toutes les tables** : même pour les tables publiques
- **Politique par défaut** : deny all
- **Insertions formulaires** : politique `INSERT` pour `anon` uniquement sur les tables de contact
- **Lecture données publiques** : politique `SELECT` pour `anon` uniquement sur les données affichables
- **Pas d'accès admin côté client** : le `service_role_key` reste côté serveur

### 9.5 Dépendances — Sécurité

- **`npm audit`** régulier : 0 vulnérabilité high/critical en production
- **Lockfile** : `package-lock.json` commité et vérifié
- **Pas de `npm install` sans vérification** : audit avant merge

---

## 10. ACCESSIBILITÉ (a11y)

### 10.1 Niveau de Conformité

- **Cible** : WCAG 2.1 niveau AA minimum
- **Test automatisé** : axe-core en CI/CD
- **Test manuel** : navigation clavier complète + lecteur d'écran

### 10.2 Règles d'Implémentation

- **Tous les éléments interactifs sont atteignables au clavier** : Tab, Enter, Escape, Flèches
- **Focus visible** : outline visible sur tous les éléments focusables
  ```css
  :focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  ```
- **Skip to content** : lien invisible au focus en haut de page
  ```html
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute ...">
    Aller au contenu principal
  </a>
  ```
- **ARIA labels** : sur tous les éléments interactifs sans texte visible
  ```html
  <button aria-label="Ouvrir le menu de navigation">
    <MenuIcon />
  </button>
  ```
- **Rôles ARIA** : `role="navigation"`, `role="main"`, `role="banner"`, `role="contentinfo"`
- **Landmarks sémantiques** : `<header>`, `<nav>`, `<main>`, `<footer>`, `<aside>`, `<section>`
- **Contrastes de couleur** : ratio minimum 4.5:1 pour le texte, 3:1 pour les grands textes
- **Texte redimensionnable** : le site reste utilisable à 200% de zoom
- **Pas d'information véhiculée uniquement par la couleur** : icônes/texte en complément
- **Media** : sous-titres pour les vidéos, transcriptions pour les audio
- **Formulaires** : labels associés à chaque input, messages d'erreur liés par `aria-describedby`

### 10.3 Tests d'Accessibilité

```typescript
// Intégration axe-core dans les tests
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

test('page should have no accessibility violations', async () => {
  const { container } = render(<Page />)
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

---

## 11. TRACKING, ANALYTICS & MESURE

### 11.1 Stack de Tracking

- **Google Analytics 4** : tracking principal (via GTM)
- **Google Tag Manager** : gestionnaire centralisé de tags (1 seul script à charger)
- **Google Search Console** : monitoring SEO, indexation, Core Web Vitals
- **Microsoft Clarity** (optionnel) : heatmaps, session recordings (gratuit, léger)

### 11.2 Implémentation GTM

```typescript
// components/analytics/GoogleTagManager.tsx
'use client'

import Script from 'next/script'

export function GoogleTagManager({ gtmId }: { gtmId: string }) {
  return (
    <>
      <Script
        id="gtm-script"
        strategy="afterInteractive"  // Ne bloque PAS le rendu
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmId}');
          `,
        }}
      />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
```

**Important** : Le GTM ne doit se charger qu'APRÈS le consentement cookies (voir section RGPD).

### 11.3 DataLayer — Événements à Tracker

```typescript
// lib/analytics/events.ts
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.dataLayer) {
    window.dataLayer.push({
      event: eventName,
      ...params,
    })
  }
}

// Événements obligatoires à configurer :
// 1. page_view — automatique via GTM
// 2. form_submission — soumission formulaire contact/devis
// 3. cta_click — clic sur CTA principal ("Demander un devis")
// 4. phone_click — clic sur numéro de téléphone
// 5. email_click — clic sur adresse email
// 6. social_click — clic vers réseaux sociaux
// 7. gallery_view — vue d'une galerie / réalisation
// 8. scroll_depth — 25%, 50%, 75%, 100% de scroll
// 9. video_play — lecture d'une vidéo
// 10. faq_expand — ouverture d'une question FAQ
```

### 11.4 Conversion Tracking

- **Google Ads** : configurer les conversions dans GTM si Google Ads utilisé
- **Facebook Pixel** : via GTM si publicité Facebook
- **Objectifs GA4** :
  - Soumission formulaire de contact = conversion principale
  - Clic téléphone = conversion secondaire
  - Visite page tarifs > 30s = micro-conversion
  - Scroll 75%+ sur page service = micro-conversion

### 11.5 Google Search Console

- **Vérification** : via enregistrement DNS TXT (méthode la plus propre)
- **Sitemap soumis** : `https://www.shootnbox.fr/sitemap.xml`
- **Propriété** : version `https://www.` et domaine entier
- **Monitoring** :
  - Couverture d'indexation (0 erreur tolérée en régime normal)
  - Core Web Vitals (toutes les URLs en "Good")
  - Erreurs 404 (traiter en <48h)
  - Actions manuelles (monitoring hebdomadaire)

### 11.6 Suivi de Performance

- **PageSpeed Insights** : test mensuel de toutes les pages clés
- **Lighthouse CI** : intégré au pipeline de déploiement
  ```json
  // lighthouserc.json
  {
    "ci": {
      "assert": {
        "assertions": {
          "categories:performance": ["error", { "minScore": 0.95 }],
          "categories:accessibility": ["error", { "minScore": 0.95 }],
          "categories:best-practices": ["error", { "minScore": 0.95 }],
          "categories:seo": ["error", { "minScore": 0.95 }]
        }
      }
    }
  }
  ```

---

## 12. RGPD & CONFORMITÉ LÉGALE

### 12.1 Bannière de Consentement Cookies

- **Solution recommandée** : Tarteaucitron.js (open source, conforme CNIL, français)
- **Alternative** : CookieYes ou solution custom minimaliste
- **Comportement** :
  - Affiché au premier visit
  - Aucun cookie non essentiel avant consentement explicite
  - GTM/GA4 ne se charge qu'après acceptation
  - Le refus est aussi facile que l'acceptation (même nombre de clics)
  - Choix modifiable à tout moment (lien en footer)

### 12.2 Catégories de Cookies

| Catégorie | Exemples | Consentement requis |
|---|---|---|
| Essentiels | Session, CSRF, préférences langue | Non |
| Analytiques | GA4, Clarity | Oui |
| Marketing | Facebook Pixel, Google Ads | Oui |
| Fonctionnels | Chat, embeds tiers | Oui |

### 12.3 Pages Légales Obligatoires

1. **Mentions légales** (`/mentions-legales`)
   - Éditeur : raison sociale, SIRET, adresse, contact
   - Directeur de publication
   - Hébergeur : nom, adresse, contact
   - Propriété intellectuelle

2. **Politique de confidentialité** (`/politique-de-confidentialite`)
   - Données collectées et finalités
   - Base légale du traitement
   - Durée de conservation
   - Droits des utilisateurs (accès, rectification, suppression, portabilité)
   - Contact DPO ou responsable
   - Transferts hors UE (si applicable — attention aux services US)

3. **Politique cookies** (`/politique-cookies`)
   - Liste exhaustive des cookies avec durée et finalité
   - Instructions pour les gérer

4. **CGV** (`/conditions-generales`) — si vente directe en ligne

### 12.4 Formulaires — Conformité RGPD

- **Consentement explicite** : checkbox non pré-cochée pour l'inscription newsletter
- **Mention sous chaque formulaire** : "Les données sont traitées par Shootnbox pour [finalité]. Vous pouvez exercer vos droits via [contact]. Voir notre [politique de confidentialité]."
- **Minimisation des données** : ne demander que les champs nécessaires
- **Durée de conservation** : définir et respecter (ex: 3 ans pour prospects)

---

## 13. STRATÉGIE DE CACHE

### 13.1 Cache Navigateur

```typescript
// next.config.ts
async headers() {
  return [
    // Assets statiques — cache long
    {
      source: '/images/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/fonts/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    // Pages HTML — cache court avec revalidation
    {
      source: '/((?!api).*)',
      headers: [
        { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
      ],
    },
  ]
}
```

### 13.2 Cache CDN (Cloudflare)

- **Page Rules** :
  - `*.shootnbox.fr/images/*` → Cache Everything, Edge TTL 1 mois
  - `*.shootnbox.fr/fonts/*` → Cache Everything, Edge TTL 1 an
  - `*.shootnbox.fr/api/*` → Bypass Cache
- **Auto Minify** : HTML, CSS, JS activé
- **Brotli** : activé
- **Early Hints** : activé (103)
- **HTTP/2** : activé
- **HTTP/3 (QUIC)** : activé

### 13.3 ISR (Incremental Static Regeneration)

```typescript
// Pour les pages avec contenu semi-dynamique
export const revalidate = 3600 // Revalider toutes les heures

// Pour les pages rarement modifiées
export const revalidate = 86400 // Revalider toutes les 24h

// Revalidation on-demand via webhook
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidation-secret')
  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const { path, tag } = await request.json()
  if (path) revalidatePath(path)
  if (tag) revalidateTag(tag)

  return NextResponse.json({ revalidated: true })
}
```

---

## 14. GESTION DES ERREURS & MONITORING

### 14.1 Pages d'Erreur Custom

```typescript
// app/not-found.tsx — Page 404
export default function NotFound() {
  return (
    <main>
      <h1>Page introuvable</h1>
      <p>La page que vous cherchez n'existe pas ou a été déplacée.</p>
      {/* Liens utiles : accueil, services, contact */}
      {/* Barre de recherche optionnelle */}
    </main>
  )
}
// IMPORTANT : retourner un status 404 (Next.js le fait automatiquement)

// app/error.tsx — Error Boundary Global
'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  // Logger l'erreur côté client
  useEffect(() => {
    console.error(error)
    // Envoyer à un service de monitoring si configuré
  }, [error])

  return (
    <main>
      <h1>Une erreur est survenue</h1>
      <p>Nous nous excusons pour la gêne occasionnée.</p>
      <button onClick={reset}>Réessayer</button>
    </main>
  )
}
```

### 14.2 Monitoring des Erreurs

- **Erreurs côté serveur** : logger dans les logs Coolify/Docker
- **Erreurs côté client** : `window.onerror` + `window.onunhandledrejection` → envoyer au serveur
- **Solution recommandée** : Sentry (plan gratuit suffisant pour commencer)
  - Ou alternative : logger custom vers Supabase table `error_logs`
- **Monitoring uptime** : UptimeRobot (gratuit) ou Better Stack
  - Vérifier : homepage, pages services, formulaire contact
  - Alertes par email + SMS si downtime > 1 min

### 14.3 Logging Structuré

```typescript
// lib/logger.ts
type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  }

  if (process.env.NODE_ENV === 'production') {
    // En prod : JSON structuré pour parsing facile
    console.log(JSON.stringify(entry))
  } else {
    // En dev : format lisible
    console[level](`[${entry.level.toUpperCase()}] ${message}`, context || '')
  }
}
```

---

## 15. DÉPLOIEMENT & CI/CD

### 15.1 Pipeline de Déploiement

```
GitHub Push → Coolify Webhook → Build Docker → Deploy → Health Check
```

### 15.2 Dockerfile Optimisé

```dockerfile
# Multi-stage build
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

### 15.3 Configuration Next.js pour Docker

```typescript
// next.config.ts
const nextConfig = {
  output: 'standalone', // Obligatoire pour Docker
  compress: true,
  poweredByHeader: false, // Supprimer le header X-Powered-By
  reactStrictMode: true,
}
```

### 15.4 Variables d'Environnement — Coolify

- Définir toutes les variables dans Coolify (pas dans le Dockerfile)
- Séparer les environnements : staging vs production
- Secrets chiffrés dans Coolify

### 15.5 Checks Pré-Déploiement

À chaque push :
1. `npm run lint` → 0 erreur
2. `npm run type-check` (tsc --noEmit) → 0 erreur
3. `npm run build` → build réussi
4. Tests unitaires → tous passent
5. Lighthouse CI → scores ≥ 95

### 15.6 Rollback

- **Coolify** : permet le rollback vers le déploiement précédent en 1 clic
- **Garder les 5 dernières images Docker** : purger les anciennes automatiquement
- **Blue-green deployment** si possible : tester la nouvelle version avant bascule

---

## 16. DNS, DOMAINE & INFRASTRUCTURE RÉSEAU

### 16.1 Configuration DNS

```
# Enregistrements DNS obligatoires
shootnbox.fr        A       → IP Cloudflare (proxy activé)
www.shootnbox.fr    CNAME   → shootnbox.fr (proxy activé)
shootnbox.fr        AAAA    → IPv6 Cloudflare
shootnbox.fr        MX      → serveur mail
shootnbox.fr        TXT     → SPF record
shootnbox.fr        TXT     → Google Search Console verification
_dmarc.shootnbox.fr TXT     → DMARC policy
```

### 16.2 Redirections Domaine

- `http://shootnbox.fr` → `https://www.shootnbox.fr` (301)
- `http://www.shootnbox.fr` → `https://www.shootnbox.fr` (301)
- `https://shootnbox.fr` → `https://www.shootnbox.fr` (301)
- **Version canonique** : `https://www.shootnbox.fr`

### 16.3 SSL/TLS

- **Certificat** : Let's Encrypt (automatique via Coolify/Traefik)
- **TLS minimum** : 1.2 (désactiver TLS 1.0 et 1.1)
- **HSTS** : activé avec `max-age=63072000; includeSubDomains; preload`
- **Inscription HSTS Preload List** : https://hstspreload.org/

---

## 17. EMAILS & DÉLIVRABILITÉ

### 17.1 Emails Transactionnels

- **Service** : Resend, Postmark, ou Brevo (anciennement Sendinblue)
- **Utilisation** : confirmation formulaire contact, notification admin
- **Template** : responsive, branded Shootnbox, texte + HTML

### 17.2 Authentification Email (DNS)

```
# SPF — Autoriser les serveurs d'envoi
shootnbox.fr  TXT  "v=spf1 include:_spf.google.com include:sendgrid.net ~all"

# DKIM — Signature cryptographique (fournie par le service d'envoi)
default._domainkey.shootnbox.fr  TXT  "v=DKIM1; k=rsa; p=..."

# DMARC — Politique de validation
_dmarc.shootnbox.fr  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@shootnbox.fr; pct=100"
```

### 17.3 Score Mail-Tester

- **Objectif** : 10/10 sur mail-tester.com
- **Checklist** :
  - SPF valide ✓
  - DKIM signé ✓
  - DMARC configuré ✓
  - Pas de blacklist ✓
  - HTML valide ✓
  - Ratio texte/image correct ✓
  - Lien de désinscription (si newsletter) ✓

---

## 18. SOCIAL MEDIA & PARTAGE

### 18.1 Open Graph (Facebook, LinkedIn, WhatsApp)

Déjà couvert dans la section Meta (3.3). Points complémentaires :

- **Image OG par page** : 1200x630px, texte lisible à petite taille
- **Tester avec** : https://developers.facebook.com/tools/debug/
- **Regénérer le cache** Facebook après modification des OG tags

### 18.2 Twitter Cards

- **Type** : `summary_large_image` pour toutes les pages
- **Tester avec** : https://cards-dev.twitter.com/validator

### 18.3 Liens Sociaux

- **Footer** : icônes vers Instagram, Facebook, TikTok, LinkedIn
- **Boutons de partage** sur les articles blog (sans scripts tiers lourds) :
  ```typescript
  // Partage natif via Web Share API (mobile) avec fallback
  const shareUrl = `https://www.shootnbox.fr/blog/${slug}`
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(title + ' ' + shareUrl)}`,
  }
  ```

---

## 19. PWA & MOBILE

### 19.1 Web App Manifest

```typescript
// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Shootnbox — Location Photobooth & Videobooth',
    short_name: 'Shootnbox',
    description: 'Location de photobooth et videobooth pour vos événements',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000', // Adapter à la charte graphique
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

### 19.2 Favicons — Set Complet

```html
<!-- Générer via https://realfavicongenerator.net/ -->
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" /> <!-- 180x180 -->
```

### 19.3 Mobile-First

- **Design mobile-first** : toujours coder le mobile d'abord, puis les breakpoints supérieurs
- **Viewport** : `<meta name="viewport" content="width=device-width, initial-scale=1" />` (automatique Next.js)
- **Touch targets** : minimum 44x44px pour tous les éléments cliquables
- **Pas de scroll horizontal** : aucun overflow-x sur mobile
- **Formulaires** : `inputmode` approprié (`tel`, `email`, `numeric`)
- **Click-to-call** : `<a href="tel:+33XXXXXXXXX">` sur le numéro

---

## 20. TESTS & QUALITÉ

### 20.1 Tests Unitaires

- **Framework** : Vitest (rapide, compatible ESM, intégration Next.js)
- **Couverture cible** : 80% sur les fichiers `lib/`, 60% global
- **Ce qui doit être testé** :
  - Fonctions utilitaires (formatage, validation, calculs)
  - Générateurs de metadata SEO
  - Générateurs Schema.org JSON-LD
  - Logique de formulaire
  - Fonctions de sanitisation/validation

### 20.2 Tests de Composants

- **Framework** : React Testing Library
- **Ce qui doit être testé** :
  - Rendu des composants clés (header, footer, formulaires)
  - Interactions utilisateur (clic CTA, soumission formulaire)
  - États de chargement et d'erreur
  - Accessibilité (via axe-core)

### 20.3 Tests E2E (si nécessaire)

- **Framework** : Playwright
- **Scénarios critiques** :
  - Navigation homepage → page service → formulaire contact → soumission
  - Blog : liste → article → navigation breadcrumb
  - Mobile : menu hamburger → navigation → CTA

### 20.4 Tests SEO Automatisés

```typescript
// tests/seo.test.ts
describe('SEO', () => {
  test('chaque page a un titre unique', async () => { /* ... */ })
  test('chaque page a une meta description', async () => { /* ... */ })
  test('chaque page a un canonical', async () => { /* ... */ })
  test('chaque page a un seul h1', async () => { /* ... */ })
  test('pas de liens brisés internes', async () => { /* ... */ })
  test('sitemap contient toutes les pages', async () => { /* ... */ })
  test('robots.txt est valide', async () => { /* ... */ })
  test('JSON-LD est valide sur chaque page', async () => { /* ... */ })
  test('images ont des attributs alt', async () => { /* ... */ })
  test('pas de mixed content HTTP/HTTPS', async () => { /* ... */ })
})
```

---

## 21. INTERNATIONALISATION (i18n)

### 21.1 État Actuel

- **Langue unique** : Français (fr-FR)
- **Préparation multilingue** : non prioritaire mais architecture compatible

### 21.2 Configuration Langue

```html
<html lang="fr">
```

- **Dates** : format français `dd/mm/yyyy` ou "15 mars 2026"
- **Monnaie** : EUR, format `XXX €` ou `XXX€ TTC`
- **Numéros de téléphone** : format `+33 X XX XX XX XX` ou `0X XX XX XX XX`
- **Utiliser `Intl` API** pour le formatage :
  ```typescript
  const formatPrice = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date)
  ```

---

## 22. SEO LOCAL & PAGES VILLES

### 22.1 Stratégie Pages Villes

Créer des pages dédiées pour chaque ville/zone stratégique en Île-de-France.

**Villes prioritaires** (Tier 1) :
- Paris (et par arrondissement si pertinent : Paris 8e, Paris 16e...)
- Boulogne-Billancourt, Neuilly-sur-Seine, Levallois-Perret
- Versailles, Saint-Germain-en-Laye
- Montreuil, Vincennes, Saint-Mandé
- Nanterre, Courbevoie, La Défense

**Villes secondaires** (Tier 2) :
- Toutes les communes des Hauts-de-Seine (92)
- Communes majeures du Val-de-Marne (94)
- Communes majeures de Seine-Saint-Denis (93)
- Communes majeures des Yvelines (78), Essonne (91), Val-d'Oise (95)

### 22.2 Structure d'une Page Ville

```
URL : /photobooth-{ville} ou /location-photobooth-{ville}
```

**Contenu unique obligatoire par page** :
- Paragraphe d'introduction mentionnant la ville et ses spécificités événementielles
- Lieux emblématiques de la ville pour des événements (châteaux, salles, hôtels)
- Témoignages d'événements réalisés dans la ville (si disponibles)
- Distances/temps de trajet depuis le siège
- FAQ locale
- CTA avec mention de la ville

**Éviter le duplicate content** :
- Minimum 60% de contenu unique entre les pages villes
- Pas de template avec juste le nom de la ville changé
- Intégrer des données locales réelles (lieux, distances, particularités)

### 22.3 Google Business Profile

- **Fiche optimisée** : nom, adresse, téléphone, horaires, catégorie
- **Photos** : mises à jour régulièrement avec des photos d'événements récents
- **Avis** : stratégie de collecte d'avis (post-événement)
- **Posts** : publications régulières (offres, événements, actualités)
- **Catégorie principale** : "Service de location de photomaton" ou "Service d'animation événementielle"

---

## 23. REDIRECTIONS & MIGRATION

### 23.1 Plan de Redirection WordPress → Nouveau Site

**Étape critique** : mapper TOUTES les URLs WordPress vers les nouvelles URLs.

```typescript
// next.config.ts — Redirections 301
async redirects() {
  return [
    // Pages WordPress courantes
    { source: '/accueil', destination: '/', permanent: true },
    { source: '/nos-services', destination: '/photobooth', permanent: true },
    { source: '/nos-services/photobooth', destination: '/photobooth', permanent: true },
    { source: '/nos-services/videobooth', destination: '/videobooth', permanent: true },
    { source: '/nos-tarifs', destination: '/tarifs', permanent: true },
    { source: '/contactez-nous', destination: '/contact', permanent: true },
    { source: '/notre-blog', destination: '/blog', permanent: true },

    // Articles blog — mapper chaque slug
    { source: '/blog/:slug', destination: '/blog/:slug', permanent: true },

    // Pages d'archive WordPress
    { source: '/category/:path*', destination: '/blog', permanent: true },
    { source: '/tag/:path*', destination: '/blog', permanent: true },
    { source: '/author/:path*', destination: '/', permanent: true },

    // Redirection des URLs avec paramètres WordPress
    { source: '/\\?p=:id', destination: '/', permanent: true },
    { source: '/\\?page_id=:id', destination: '/', permanent: true },

    // Fichiers WordPress à ne plus servir
    { source: '/wp-content/:path*', destination: '/', permanent: true },
    { source: '/wp-admin/:path*', destination: '/', permanent: true },
    { source: '/wp-login.php', destination: '/', permanent: true },
    { source: '/xmlrpc.php', destination: '/', permanent: true },
    { source: '/wp-json/:path*', destination: '/', permanent: true },

    // Trailing slashes
    { source: '/:path+/', destination: '/:path+', permanent: true },
  ]
}
```

### 23.2 Process de Migration

1. **Avant la migration** :
   - Lister TOUTES les URLs indexées (via `site:shootnbox.fr` dans Google ou Screaming Frog)
   - Exporter les données Search Console (performances, pages indexées)
   - Sauvegarder les positions actuelles pour les mots-clés clés
   - Préparer le fichier de mapping old URL → new URL

2. **Jour J** :
   - Activer les redirections 301
   - Soumettre le nouveau sitemap dans Search Console
   - Demander l'indexation des pages clés via Search Console
   - Vérifier que le robots.txt est correct

3. **Après la migration** :
   - Surveiller les erreurs 404 dans Search Console quotidiennement pendant 1 mois
   - Ajouter les redirections manquantes au fur et à mesure
   - Comparer les positions avant/après sur les mots-clés clés
   - Surveiller le trafic organique (baisse normale de 10-20% temporaire)

---

## 24. CHECKLIST PRÉ-PRODUCTION

### 24.1 SEO

- [ ] Chaque page a un `<title>` unique (50-60 chars)
- [ ] Chaque page a une `<meta description>` unique (150-160 chars)
- [ ] Chaque page a un `<link rel="canonical">`
- [ ] Chaque page a un seul `<h1>`
- [ ] Hiérarchie des headings respectée (h1→h2→h3)
- [ ] Sitemap XML généré et soumis
- [ ] Robots.txt correct et accessible
- [ ] Données structurées JSON-LD sur chaque type de page
- [ ] Pas de contenu dupliqué
- [ ] Pas de liens brisés (internes et externes)
- [ ] Breadcrumbs implémentés
- [ ] Google Search Console configuré et vérifié
- [ ] Redirections 301 WordPress → nouveau site complètes
- [ ] URL canonique www vs non-www résolue
- [ ] HTTP → HTTPS redirection en place

### 24.2 Performance

- [ ] PageSpeed Score ≥ 95 mobile, ≥ 98 desktop
- [ ] LCP ≤ 1.8s
- [ ] INP ≤ 150ms
- [ ] CLS ≤ 0.05
- [ ] Images en WebP avec dimensions explicites
- [ ] Lazy loading sur les images sous le fold
- [ ] Polices optimisées (preload, swap, subset)
- [ ] Bundle JS < 150kB (First Load)
- [ ] Pas de CSS inutilisé
- [ ] HTTP/2 ou HTTP/3 activé
- [ ] Compression Brotli activée
- [ ] CDN Cloudflare configuré

### 24.3 Sécurité

- [ ] HTTPS obligatoire avec HSTS
- [ ] Headers de sécurité (CSP, X-Frame-Options, etc.)
- [ ] Pas de secret dans le code source
- [ ] Variables d'environnement configurées dans Coolify
- [ ] Rate limiting sur les formulaires
- [ ] Honeypot anti-spam
- [ ] Validation côté serveur (Zod)
- [ ] RLS Supabase activé
- [ ] `npm audit` : 0 vulnérabilité critique

### 24.4 Accessibilité

- [ ] Navigation clavier complète
- [ ] Focus visible sur tous les éléments interactifs
- [ ] Skip to content
- [ ] Contrastes de couleur conformes (AA)
- [ ] Attributs alt sur toutes les images informatives
- [ ] Labels sur tous les champs de formulaire
- [ ] axe-core : 0 erreur

### 24.5 Tracking & Légal

- [ ] GTM/GA4 configuré et fonctionnel
- [ ] Bannière cookies RGPD implémentée
- [ ] GTM ne charge qu'après consentement
- [ ] Événements de conversion trackés
- [ ] Mentions légales publiées
- [ ] Politique de confidentialité publiée
- [ ] Politique cookies publiée

### 24.6 Déploiement

- [ ] Dockerfile optimisé multi-stage
- [ ] Build réussi sur Coolify
- [ ] Health check configuré
- [ ] Monitoring uptime actif
- [ ] Backup DNS configuré
- [ ] Email SPF/DKIM/DMARC configurés
- [ ] SSL renouvelé automatiquement
- [ ] Rollback testé

### 24.7 Contenu

- [ ] Tous les textes relus et validés
- [ ] Images de qualité professionnelle (pas de stock generic)
- [ ] Formulaire de contact testé (envoi + réception)
- [ ] Numéro de téléphone cliquable et correct
- [ ] Liens sociaux pointent vers les bons profils
- [ ] Pages 404 et erreur personnalisées

---

## ANNEXE A — FICHIER CLAUDE.MD RECOMMANDÉ

Ce fichier doit être placé à la racine du projet pour guider Claude Code :

```markdown
# CLAUDE.md — Shootnbox Website

## Contexte
Refonte du site shootnbox.fr. Migration WordPress/Elementor → Next.js (App Router).
Déploiement via Coolify sur serveur OVH dédié.

## Stack
- Next.js 14+ (App Router, TypeScript strict)
- Tailwind CSS 4+
- Supabase (PostgreSQL + Auth)
- Shadcn/UI
- MDX pour le contenu blog

## Règles Impératives
1. TypeScript strict — jamais de `any`, jamais de `@ts-ignore`
2. Chaque page doit exporter `generateMetadata()` avec title, description, canonical, OG
3. Chaque page SEO doit avoir un JSON-LD Schema.org approprié
4. Images via `<Image>` Next.js uniquement — jamais de `<img>` natif
5. Composants < 150 lignes, fonctions < 40 lignes
6. Pas de `console.log` — utiliser le logger
7. Validation avec Zod côté client ET serveur
8. Pas de dépendance ajoutée sans justification
9. Mobile-first : toujours coder le mobile d'abord

## SEO Checklist (vérifier à chaque nouvelle page)
- [ ] `generateMetadata()` avec title (50-60 chars), description (150-160 chars), canonical
- [ ] Un seul h1 avec mot-clé principal
- [ ] Hiérarchie headings h1→h2→h3
- [ ] JSON-LD approprié (Article, Service, LocalBusiness, FAQ, BreadcrumbList)
- [ ] Images avec alt descriptif
- [ ] Liens internes (3-5 minimum)
- [ ] Breadcrumbs

## Performance Targets
- LCP ≤ 1.8s, INP ≤ 150ms, CLS ≤ 0.05
- PageSpeed ≥ 95 mobile
- Bundle JS < 150kB First Load

## Structure
Voir CAHIER_DES_CHARGES_TECHNIQUE.md pour l'arborescence complète et les détails.

## Commandes
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run type-check` — TypeScript check
- `ANALYZE=true npm run build` — bundle analysis
```

---

## ANNEXE B — OUTILS DE VÉRIFICATION

| Outil | URL | Usage |
|---|---|---|
| PageSpeed Insights | pagespeed.web.dev | Core Web Vitals, performance |
| Google Search Console | search.google.com/search-console | Indexation, erreurs, performance SEO |
| Rich Results Test | search.google.com/test/rich-results | Validation données structurées |
| Schema Markup Validator | validator.schema.org | Validation JSON-LD |
| Facebook Debugger | developers.facebook.com/tools/debug | Vérification Open Graph |
| Twitter Card Validator | cards-dev.twitter.com/validator | Vérification Twitter Cards |
| Lighthouse | Chrome DevTools | Audit complet (perf, a11y, SEO) |
| axe DevTools | Extension Chrome | Accessibilité |
| Screaming Frog | screamingfrog.co.uk | Crawl SEO complet |
| Mail-Tester | mail-tester.com | Score délivrabilité email |
| HSTS Preload | hstspreload.org | Vérification HSTS |
| SSL Labs | ssllabs.com/ssltest | Test configuration SSL |
| SecurityHeaders.com | securityheaders.com | Vérification headers sécurité |
| GTmetrix | gtmetrix.com | Performance alternative |
| Bundlephobia | bundlephobia.com | Taille des dépendances npm |

---

*Document généré le 23 mars 2026 — À maintenir à jour tout au long du développement.*
