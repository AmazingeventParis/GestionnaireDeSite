/**
 * Cookie Consent — Shootnbox
 * RGPD/CNIL compliant cookie consent banner
 * Blocks GTM/GA4 until explicit consent
 */
(function() {
  'use strict';

  var CONSENT_KEY = 'snb_cookie_consent';
  var GTM_ID = ''; // Set via site-config.json seo.gtmId

  // Check existing consent
  var consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'accepted') {
    loadGTM();
    return;
  }
  if (consent === 'rejected') {
    return; // Don't show banner, don't load GTM
  }

  // Show banner (first visit)
  var banner = document.createElement('div');
  banner.id = 'snb-cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Gestion des cookies');
  banner.innerHTML = [
    '<div class="snb-cookie-inner">',
    '  <p class="snb-cookie-text">',
    '    Nous utilisons des cookies pour analyser le trafic et ameliorer votre experience. ',
    '    <a href="/mentions-legales/" class="snb-cookie-link">En savoir plus</a>',
    '  </p>',
    '  <div class="snb-cookie-buttons">',
    '    <button id="snb-cookie-reject" class="snb-cookie-btn snb-cookie-btn-reject">Refuser</button>',
    '    <button id="snb-cookie-accept" class="snb-cookie-btn snb-cookie-btn-accept">Accepter</button>',
    '  </div>',
    '</div>'
  ].join('\n');

  // Inject styles
  var style = document.createElement('style');
  style.textContent = [
    '#snb-cookie-banner{',
    '  position:fixed;bottom:0;left:0;right:0;z-index:99999;',
    '  background:rgba(26,10,34,0.95);backdrop-filter:blur(12px);',
    '  padding:16px 24px;font-family:"Raleway",sans-serif;',
    '  border-top:2px solid #E51981;',
    '  animation:snbSlideUp 0.4s cubic-bezier(0.25,0.46,0.45,0.94)',
    '}',
    '@keyframes snbSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '.snb-cookie-inner{',
    '  max-width:1300px;margin:0 auto;',
    '  display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap',
    '}',
    '.snb-cookie-text{color:#fff;font-size:14px;line-height:1.5;margin:0;flex:1;min-width:280px}',
    '.snb-cookie-link{color:#ff6eb4;text-decoration:underline}',
    '.snb-cookie-buttons{display:flex;gap:12px;flex-shrink:0}',
    '.snb-cookie-btn{',
    '  padding:10px 24px;border-radius:50px;font-family:"Raleway",sans-serif;',
    '  font-weight:600;font-size:14px;cursor:pointer;border:none;',
    '  transition:all 0.3s ease',
    '}',
    '.snb-cookie-btn-reject{',
    '  background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3)',
    '}',
    '.snb-cookie-btn-reject:hover{border-color:#fff}',
    '.snb-cookie-btn-accept{',
    '  background:linear-gradient(135deg,#E51981,#ff3fac);color:#fff',
    '}',
    '.snb-cookie-btn-accept:hover{transform:translateY(-2px);box-shadow:0 4px 15px rgba(229,25,129,0.4)}',
    '@media(max-width:600px){',
    '  .snb-cookie-inner{flex-direction:column;text-align:center}',
    '  .snb-cookie-buttons{width:100%;justify-content:center}',
    '}'
  ].join('');
  document.head.appendChild(style);

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(banner); bindEvents(); });
  } else {
    document.body.appendChild(banner);
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('snb-cookie-accept').addEventListener('click', function() {
      localStorage.setItem(CONSENT_KEY, 'accepted');
      banner.remove();
      loadGTM();
    });
    document.getElementById('snb-cookie-reject').addEventListener('click', function() {
      localStorage.setItem(CONSENT_KEY, 'rejected');
      banner.remove();
    });
  }

  function loadGTM() {
    if (!GTM_ID) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    document.head.appendChild(s);
  }
})();
