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
- Orange accent : #FF7A00 (variante : #ff9a3c light)
- Vert accent : #16A34A (variante : #4ade80 light)
- Texte : #323338 (dark), #999 (muted), #666 (secondary)
- Fonds sections : transparent, pas de fond, pas d'arrondis sur les sections wrapper
- Fonds cartes interieures : pastels clairs (#f8eaff, #e8d4f0, lilas)

COULEURS PAR BORNE/PRODUIT :
- Ring = orange (#FF7A00 → #ff9a3c)
- Vegas = rose (#E51981 → #ff6eb4)
- Miroir = bleu (#0250FF → #4d8bff)
- Spinner = vert (#16A34A → #4ade80)
Utiliser ces paires pour les CTA, bordures, badges et features de chaque produit.

CTA / BOUTONS :
- Gradient : linear-gradient(135deg, couleur, couleur-light), texte blanc
- Border-radius : 50px
- Effet shine au hover : ::before pseudo-element gradient blanc translateX(-100% → 100%)
- Hover : translateY(-2px) + box-shadow 0 8px 25px rgba(0,0,0,0.15)
- Transition : all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)

CARTES PASTEL (neumorphism) :
- Fond degrade lilas : linear-gradient(145deg, #f5eaf9, #ecdaf3)
- Border-radius : 12-16px
- Double shadow neumorphism :
  inset 4px 4px 8px rgba(180,140,200,0.15),
  inset -3px -3px 6px rgba(255,255,255,0.7),
  outer 4px 4px 12px rgba(180,140,200,0.12),
  -3px -3px 8px rgba(255,255,255,0.6)
- Bordure neon coloree : 1.5px solid rgba(couleur, 0.4) + glow 0 0 12px rgba(couleur, 0.15)
- Hover : translateY(-3px) scale(1.01)

CARTES PRODUIT DARK (bornes, offres) :
- Fond dark contrast : #1e1e2e pour contraster avec les sections pastels
- Texte clair : #f0f0f5, noms en gradient colore (-webkit-background-clip: text)
- Bordure subtile : 1px solid rgba(255,255,255,0.06)
- Shadow profonde : 0 20px 60px -15px rgba(0,0,0,0.3)
- Features : fond semi-transparent colore rgba(couleur, 0.12) + border rgba(couleur, 0.25)
- Badge "Best-seller" : gradient rose, position absolute top-left, radius 14px
- Carte mise en avant : border 2px solid #E51981 + glow rose 0 0 40px -10px rgba(229,25,129,0.15)
- Hover : scale + shadow amplifiee

PANELS/OVERLAYS :
- Glassmorphism : backdrop-filter blur(12px), fond semi-transparent
- Shimmer anime, sparkles subtils
- UNIQUEMENT sur les panels interieurs, PAS sur les sections wrappers

SECTIONS WRAPPERS :
- PAS de glassmorphism, PAS de shimmer, PAS de border-radius, PAS de box-shadow
- Fond : transparent ou couleur unie tres legere
- Padding : 60px desktop / 40px mobile

GLOWS D'AMBIANCE :
- Blobs radiaux flous derriere les sections cles :
  radial-gradient(circle, rgba(couleur, 0.08-0.12) 0%, transparent 70%)
  + filter: blur(60-80px)
- Couleurs : rose rgba(229,25,129,0.12), violet rgba(100,60,255,0.08), bleu rgba(2,80,255,0.06)
- Animation pulse subtile : scale 1 → 1.15, opacity 0.7 → 1, duree 6s

SEPARATEURS :
- Ligne gradient centree : linear-gradient(90deg, transparent, #E51981, transparent)
- Height : 3px, border-radius: 3px, width: 180px, margin: 0 auto

ICONES : style glossy 3D SVG (pas flat, pas outline)

LAYOUT :
- Max-width : 1300px centre
- Section padding : 60px desktop / 40px mobile
- Header : 72px desktop / 60px mobile, fixed, z-index 9999

UX & LAYOUT CREATIF :
- Responsive optimise
- Affichage creatif et original — pas de layout generique/previsible
- Mise en page astucieuse : asymetrie, grilles decalees, elements qui se chevauchent
- Reveals au scroll quand pertinent
- Chaque bloc doit avoir un parti pris de design intentionnel, pas un rendu "template"

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
Style Shootnbox : Raleway (400-900, italic H1/H2), rose #E51981, bleu #0250FF, violet #a855f7, orange #FF7A00, vert #16A34A. Fonds sections transparents sans arrondis. Cartes interieures : neumorphism pastel lilas (inset shadows, bordures neon colorees). Cartes produit : dark mode #1e1e2e avec texte gradient colore, features en rgba(couleur, 0.12). CTA gradient par produit (Ring=orange, Vegas=rose, Miroir=bleu, Spinner=vert), radius 50px, shine hover. Glows radiaux flous (blur 80px) derriere les sections cles. Separateurs gradient rose centres. Icones glossy 3D SVG. Max-width 1300px. Layout creatif : asymetrie, grilles decalees, pas de template generique. Responsive mobile-first. HTML standalone avec <style> inline.
```

---

## Notes pour la creation de blocs

1. **Coller le prompt UNE FOIS** en debut de conversation — Claude le garde en contexte
2. **Reference un bloc existant** quand possible : "Dans le style du module service-v2"
3. **Si nouvelle conversation** : recoller le prompt
4. **Nommer les fichiers** : `XX-nom-section.html` (XX = numero d'ordre)
5. **Placer dans** : `previews/<slug-page>/` puis ajouter dans build.js
