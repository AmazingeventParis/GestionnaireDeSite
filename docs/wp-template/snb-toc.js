/**
 * snb-toc.js — Génération dynamique du sommaire (TOC) + scroll actif
 * À placer dans : wp-content/themes/VOTRE-THEME-ENFANT/js/snb-toc.js
 * Équivalent JS du TOC serveur du GestionnaireDeSite
 */
(function () {
  'use strict';

  function buildTOC() {
    var list    = document.getElementById('snb-toc-list');
    var nav     = document.getElementById('snb-toc-nav');
    var body    = document.querySelector('.snb-article-body');
    if (!list || !body) return;

    // Sélectionne tous les H2 (et H3 en sous-items si souhaité)
    var headings = body.querySelectorAll('h2, h3');
    if (!headings.length) { if (nav) nav.style.display = 'none'; return; }

    var fragment = document.createDocumentFragment();
    var seen     = {};

    headings.forEach(function (h) {
      var text = h.textContent.trim();
      if (!text || seen[text]) return;
      seen[text] = true;

      // Auto-génère un id si absent
      if (!h.id) {
        h.id = text
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      var li = document.createElement('li');
      if (h.tagName === 'H3') li.className = 'h3-item';

      var a = document.createElement('a');
      a.href        = '#' + h.id;
      a.textContent = text;

      // Scroll fluide
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(h.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Offset pour le header sticky (ajuster selon la hauteur réelle)
          window.scrollBy(0, -100);
        }
      });

      li.appendChild(a);
      fragment.appendChild(li);
    });

    list.appendChild(fragment);

    // ── Indicateur actif au scroll ─────────────────────────────────────────
    var links = list.querySelectorAll('a');
    if (!links.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('active'); });
          var active = list.querySelector('a[href="#' + entry.target.id + '"]');
          if (active) active.classList.add('active');
        }
      });
    }, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0
    });

    headings.forEach(function (h) { observer.observe(h); });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      buildTOC();
      initCopyLink();
    });
  } else {
    buildTOC();
    initCopyLink();
  }
})();
