/**
 * snb-toc.js — Sommaire dynamique (TOC) + scroll actif + fixes seocontent
 * WordPress child theme: wp-content/themes/skole-child/js/snb-toc.js
 */
(function () {
  'use strict';

  // ── Utilitaire : position absolue depuis le haut du document ──────────────
  // IMPORTANT : ne pas utiliser el.offsetTop seul — valeur relative au parent,
  // pas comparable à window.scrollY. Toujours traverser offsetParent.
  function getAbsoluteTop(el) {
    var top = 0;
    while (el) { top += el.offsetTop; el = el.offsetParent; }
    return top;
  }

  // ── Sommaire ───────────────────────────────────────────────────────────────
  function buildTOC() {
    var list = document.getElementById('snb-toc-list');
    var nav  = document.getElementById('snb-toc-nav');
    var body = document.querySelector('.snb-article-body');
    if (!list || !body) return;

    var headings = body.querySelectorAll('h2');
    if (!headings.length) { if (nav) nav.style.display = 'none'; return; }

    var fragment = document.createDocumentFragment();
    var seen = {};
    var tocHeadings = []; // headings effectivement ajoutés

    headings.forEach(function (h) {
      var text = h.textContent.trim();
      if (!text || seen[text]) return;
      seen[text] = true;

      // Génère un id si absent
      if (!h.id) {
        h.id = text
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href        = '#' + h.id;
      a.textContent = text;

      // Scroll fluide avec offset header (90px)
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(h.id);
        if (target) {
          var top = getAbsoluteTop(target) - 90;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });

      li.appendChild(a);
      fragment.appendChild(li);
      tocHeadings.push(h);
    });

    list.appendChild(fragment);

    var links = list.querySelectorAll('a');
    if (!links.length) return;

    // Pré-calcul des positions absolues (recalculé au resize)
    var sections = [];
    function buildSections() {
      sections = [];
      tocHeadings.forEach(function (h, i) {
        sections.push({ absTop: getAbsoluteTop(h), a: links[i] });
      });
    }
    buildSections();
    window.addEventListener('resize', buildSections, { passive: true });

    // ── Indicateur actif au scroll ──────────────────────────────────────────
    function onScroll() {
      var scrollY = window.scrollY + 120;
      var current = null;
      sections.forEach(function (s) {
        if (s.absTop <= scrollY) current = s;
      });
      links.forEach(function (a) { a.classList.remove('active'); });
      if (current) current.a.classList.add('active');
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Délai léger pour laisser les images charger et stabiliser les positions
    setTimeout(function () { buildSections(); onScroll(); }, 400);
  }

  // ── Fix cartes "À lire aussi" seocontent ──────────────────────────────────
  //
  // seocontent génère les cartes sur plusieurs blocs WP incompatibles :
  //   <!-- wp:paragraph --><p><a href="URL" style="border-radius:12px"></p>
  //   <!-- wp:html --><div ...>...</div>
  //   <!-- wp:paragraph --><p></div></a></p>
  //
  // Le navigateur auto-ferme <a> avant </p> → la div carte n'est jamais dans
  // le lien → carte non cliquable.
  //
  // Ce fix détecte le pattern et rewrappe la div dans le lien.
  function fixReadAlsoCards() {
    var body = document.querySelector('.snb-article-body');
    if (!body) return;

    var paragraphs = Array.from(body.querySelectorAll('p'));
    paragraphs.forEach(function (p) {
      // Cherche un <a> vide avec border-radius:12px (signature seocontent)
      var a = p.querySelector('a[style*="border-radius:12px"]');
      if (!a) return;
      // L'<a> doit être vide (fermé par le navigateur avant </p>)
      if (a.textContent.trim() !== '' || a.children.length > 0) return;

      // La div carte doit être le prochain frère
      var cardDiv = p.nextElementSibling;
      if (!cardDiv || cardDiv.tagName !== 'DIV') return;

      // Vérifie que c'est bien une carte flex seocontent (contient une image)
      var cs = cardDiv.getAttribute('style') || '';
      if (!cs.includes('flex') && !cs.includes('min-height')) return;
      if (!cardDiv.querySelector('img')) return;

      // Déplace la div dans le lien
      a.appendChild(cardDiv);

      // Extrait <a> du <p> et insère avant le <p>
      p.parentNode.insertBefore(a, p);

      // Supprime le <p> vide restant
      if (p.textContent.trim() === '') p.remove();

      // Supprime le <p> de clôture vide suivant (le </div></div></a> parasite)
      var nextP = a.nextElementSibling;
      if (nextP && nextP.tagName === 'P' && nextP.textContent.trim() === '') {
        nextP.remove();
      }
    });
  }

  // ── Wrap les tableaux nus dans snb-table-wrap ──────────────────────────────
  function wrapTables() {
    var body = document.querySelector('.snb-article-body');
    if (!body) return;
    body.querySelectorAll('table').forEach(function (table) {
      if (table.closest('.snb-table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'snb-table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  // ── Copie du lien ──────────────────────────────────────────────────────────
  function initCopyLink() {
    var btn = document.getElementById('snb-copy-link');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      navigator.clipboard.writeText(window.location.href).then(function () {
        btn.title = 'Lien copié !';
        btn.style.borderColor = '#16a34a';
        setTimeout(function () {
          btn.style.borderColor = '';
          btn.title = '';
        }, 2000);
      });
    });
  }

  function init() {
    fixReadAlsoCards(); // en premier : le DOM doit être stable avant buildTOC
    wrapTables();
    buildTOC();
    initCopyLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
