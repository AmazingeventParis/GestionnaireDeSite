/*! Smakk page interactions : reveal + animation-pause + marquee + accordions
 *  Externalized from inline bodyEndCustom for browser caching + parallel parsing.
 *  Loaded via <script defer> at end of body.
 */
(function () {
  // ── 1. Single IntersectionObserver dispatcher (reveal) ──
  var REVEAL = '.smk-why-rv, .smk-trans-rv, .smk-howto-rv, .smk-faq-rv, .smk-mfeat-rv';
  var ANIM = '.smk-why, .smk-trans, .smk-howto, .smk-mq, .smk-pcards, .smk-deliv, .smk-feat, .smk-faq, .smk-loc, .smk-locherok, .smk-mfeat, .smk-mirfeat, .smk-mirfeat2, .smk-mircad, .smk-mirsuc, .smk-mfaq, .smk-mcontact, .smk-mirfin, .smk-mirhero';

  if ('IntersectionObserver' in window) {
    // Reveal observer : fires once
    var revealEls = document.querySelectorAll(REVEAL);
    if (revealEls.length) {
      var revObs = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add('on');
            revObs.unobserve(entries[i].target);
          }
        }
      }, { threshold: 0.15 });
      for (var r = 0; r < revealEls.length; r++) revObs.observe(revealEls[r]);
    }

    // Animation pause/play + marquee toggle : single observer, threshold 0
    var animEls = document.querySelectorAll(ANIM);
    var marquee = document.getElementById('smk-mq-inner');
    if (marquee) {
      marquee.style.animationPlayState = 'paused';
      animEls = Array.prototype.slice.call(animEls);
      var mqParent = marquee.closest('.smk-mq');
      if (mqParent && animEls.indexOf(mqParent) === -1) animEls.push(mqParent);
    }
    if (animEls.length) {
      var pauseObs = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var t = entries[i].target;
          var visible = entries[i].isIntersecting;
          if (visible) t.classList.remove('smk-paused'); else t.classList.add('smk-paused');
          if (marquee && t.classList.contains('smk-mq')) {
            marquee.style.animationPlayState = visible ? 'running' : 'paused';
          }
        }
      }, { rootMargin: '50px', threshold: 0 });
      for (var a = 0; a < animEls.length; a++) {
        animEls[a].classList.add('smk-paused');
        pauseObs.observe(animEls[a]);
      }
    }
  }

  // ── 2. Accordion delegation ──
  document.addEventListener('click', function (e) {
    var head = e.target.closest('.smk-mfeat-head, .smk-mirsuc-q, .smk-mfaq-q, .smk-feat-head');
    if (!head) return;
    var item = head.closest('.smk-mfeat-item, .smk-mirsuc-item, .smk-mfaq-item, .smk-feat-item');
    if (!item) return;
    if (item.classList.contains('smk-mfeat-item') || item.classList.contains('smk-feat-item')) {
      var siblings = item.parentElement.querySelectorAll('.smk-mfeat-item, .smk-feat-item');
      var wasActive = item.classList.contains('is-active');
      for (var s = 0; s < siblings.length; s++) siblings[s].classList.remove('is-active');
      if (!wasActive) item.classList.add('is-active');
    } else {
      item.classList.toggle('is-open');
    }
  });
})();
