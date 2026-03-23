# Charte Graphique — Prompt pour Claude

> Ce texte est a copier-coller au debut de chaque conversation Claude
> quand tu crees des blocs HTML pour le site Shootnbox.
> Il assure la coherence visuelle entre tous les blocs.

---

## Prompt complet (a copier)

```
CHARTE GRAPHIQUE SHOOTNBOX — Respecter pour chaque bloc HTML cree :

POLICE : Raleway uniquement, self-hosted woff2
- H1/H2 : 50px desktop / 28-32px mobile, weight 900, italic, line-height ~1.1
- H3 : 28px / 22px, weight 700, line-height 1.3
- Body : 16px / 15px, weight 400, line-height 1.6
- Small/labels : 11-13px

COULEURS :
- Rose principal : #E51981 (variantes : #ff6eb4 light, #ff3fac medium, #c41470 dark)
- Bleu : #0250FF (variante : #4d8aff light)
- Violet : #7828C8 (variantes : #a855f7 light, #c084fc soft)
- Orange accent : #FF7A00
- Vert accent : #16A34A
- Texte : #323338 (dark), #999 (muted), #666 (secondary)
- Fonds : #fff (main), #f8eaff (alt), pastels clairs — JAMAIS de fond sombre

CTA / BOUTONS :
- Gradient : linear-gradient(135deg, #E51981, #ff3fac), texte blanc
- Border-radius : 50px
- Effet shine au hover : ::before pseudo-element gradient blanc translateX(-100% → 100%)
- Transition : all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)

STYLE DES CARTES :
- Neumorphism/clay : fond pastel lilas/rose, inset shadows douces
- Border-radius : 12-16px
- Bordures neon colorees (1-2px solid avec couleur de la palette)
- Hover : translateY(-3px) scale(1.05)

PANELS/OVERLAYS :
- Glassmorphism : backdrop-filter blur(12px), fond semi-transparent
- Shimmer anime, sparkles subtils

ICONES : style glossy 3D SVG (pas flat, pas outline)

LAYOUT :
- Max-width : 1300px centre
- Section padding : 60px desktop / 40px mobile
- Header : 72px desktop / 60px mobile, fixed, z-index 9999

BREAKPOINTS :
- 1100px : condenser
- 850px : mobile (burger menu)
- 768px : hero mobile
- 480px : small mobile

TRANSITIONS : all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)

TON : Festif, evenementiel, premium, professionnel

IMPORTANT :
- Le bloc doit etre un fichier HTML standalone (avec <html>, <head>, <style>, <body>)
- CSS dans une balise <style> dans le <head> (pas de fichier externe)
- JS dans une balise <script> en fin de body si necessaire
- Images avec chemin relatif ../../public/site-images/ (pour les sous-pages) ou ../public/site-images/ (pour home)
- Pas de bibliotheque externe (pas de jQuery, Bootstrap, FontAwesome)
- Responsive : mobile-first
```

---

## Prompt court (version allege)

Pour les conversations ou le contexte est limite :

```
Style Shootnbox : Raleway (400-900, italic H1/H2), rose #E51981, bleu #0250FF, violet #a855f7, orange #FF7A00, vert #16A34A. Fonds pastels clairs (#f8eaff), jamais sombres. CTA gradient rose, border-radius 50px, shine hover. Cartes neumorphism, glassmorphism panels, icones glossy 3D SVG. Max-width 1300px, responsive mobile-first. Ton festif/premium. HTML standalone avec <style> inline.
```

---

## Notes pour la creation de blocs

1. **Coller le prompt UNE FOIS** en debut de conversation — Claude le garde en contexte
2. **Reference un bloc existant** quand possible : "Dans le style du module service-v2"
3. **Si nouvelle conversation** : recoller le prompt
4. **Nommer les fichiers** : `XX-nom-section.html` (XX = numero d'ordre)
5. **Placer dans** : `previews/<slug-page>/` puis ajouter dans build.js
