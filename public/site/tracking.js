/**
 * DataLayer Event Tracking — Shootnbox
 * Pushes events to GTM dataLayer for GA4 tracking
 * Only fires if cookie consent was accepted
 */
(function() {
  'use strict';

  // Only track if consent given
  if (localStorage.getItem('snb_cookie_consent') !== 'accepted') return;

  window.dataLayer = window.dataLayer || [];

  function track(event, params) {
    window.dataLayer.push(Object.assign({ event: event }, params || {}));
  }

  // === CTA clicks ===
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a, button');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    var text = (link.textContent || '').trim().substring(0, 100);

    // Phone clicks
    if (href.startsWith('tel:')) {
      track('phone_click', { phone_number: href.replace('tel:', ''), link_text: text });
      return;
    }

    // Email clicks
    if (href.startsWith('mailto:')) {
      track('email_click', { email: href.replace('mailto:', ''), link_text: text });
      return;
    }

    // Social clicks
    var socials = ['instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'linkedin.com'];
    for (var i = 0; i < socials.length; i++) {
      if (href.includes(socials[i])) {
        track('social_click', { platform: socials[i].split('.')[0], link_url: href });
        return;
      }
    }

    // CTA clicks (buttons with gradient or specific classes)
    if (link.classList.contains('cta') || link.classList.contains('snb-cta') ||
        text.toLowerCase().includes('devis') || text.toLowerCase().includes('reserver') ||
        text.toLowerCase().includes('reservation')) {
      track('cta_click', { cta_text: text, cta_url: href, page: window.location.pathname });
    }
  });

  // === Scroll depth ===
  var scrollThresholds = [25, 50, 75, 100];
  var scrollFired = {};

  function checkScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    var percent = Math.round((scrollTop / docHeight) * 100);

    for (var i = 0; i < scrollThresholds.length; i++) {
      var threshold = scrollThresholds[i];
      if (percent >= threshold && !scrollFired[threshold]) {
        scrollFired[threshold] = true;
        track('scroll_depth', { percent: threshold, page: window.location.pathname });
      }
    }
  }

  var scrollTimer;
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(checkScroll, 200);
  }, { passive: true });

  // === FAQ expand ===
  document.addEventListener('toggle', function(e) {
    if (e.target.tagName === 'DETAILS' && e.target.open) {
      var summary = e.target.querySelector('summary');
      if (summary) {
        track('faq_expand', { question: summary.textContent.trim().substring(0, 200) });
      }
    }
  }, true);

  // === Form submissions ===
  document.addEventListener('submit', function(e) {
    var form = e.target;
    track('form_submission', {
      form_id: form.id || 'unknown',
      form_action: form.action || window.location.pathname,
      page: window.location.pathname
    });
  });

})();
