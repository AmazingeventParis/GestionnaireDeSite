/**
 * Canonical Shootnbox (legacy) visitor tracking — LOCKED IN CODE.
 *
 * Why this exists:
 *   The visitor tracker + GTM + first-touch ADS source script were lost on
 *   10/06/2026 because they lived only in scripts.headCustom (runtime config),
 *   which a Coolify rebuild reverted to git's empty value. The values are now
 *   committed in site-config.json, AND this module provides a self-healing
 *   fallback: routes/pages.js and scripts/build.js inject these blocks for the
 *   LEGACY (Shootnbox) site ONLY when headCustom/bodyEndCustom does not already
 *   contain them. So even if the config is wiped again, tracking can never
 *   silently disappear from the static pages (no data loss).
 *
 * Idempotent: detection keys ('snb-tracker.js' / 'ns.html?id=GTM-PNKV3HG')
 * prevent double-injection when the config already carries the tracking.
 * Multi-site safe: callers guard on the legacy/Shootnbox site only — never Smakk.
 *
 * To change the GTM id or tracker path, update BOTH this file and the
 * committed site-config.json so the two sources stay in sync.
 */

// Injected just before </head> on legacy pages: GTM + first-touch ADS + tracker.
const HEAD = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PNKV3HG');</script>
<!-- End Google Tag Manager -->
<!-- Source tracking (first-touch) -->
<script>
(function(){
  var DOMAIN = '.shootnbox.fr';
  var DAYS = 30;
  function setC(n, v) {
    if (!v) return;
    document.cookie = n + '=' + encodeURIComponent(v) + ';path=/;max-age=' + (DAYS*86400) + ';domain=' + DOMAIN + ';SameSite=Lax';
  }
  function getC(n) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  var p = new URLSearchParams(window.location.search);
  var gclid = p.get('gclid');
  if (gclid && !getC('snb_gclid')) { setC('snb_gclid', gclid); setC('snb_src', 'ADS'); }
  var fbclid = p.get('fbclid');
  if (fbclid && !getC('snb_fbclid')) {
    setC('snb_fbclid', fbclid);
    if (!getC('snb_src')) setC('snb_src', 'FACEBOOK');
  }
  var msclkid = p.get('msclkid');
  if (msclkid && !getC('snb_msclkid')) {
    setC('snb_msclkid', msclkid);
    if (!getC('snb_src')) setC('snb_src', 'ADS');
  }
  var ttclid = p.get('ttclid');
  if (ttclid && !getC('snb_ttclid')) {
    setC('snb_ttclid', ttclid);
    if (!getC('snb_src')) setC('snb_src', 'TIKTOK');
  }
  var utmSrc = p.get('utm_source'), utmMed = p.get('utm_medium'), utmCmp = p.get('utm_campaign');
  if (utmSrc && !getC('snb_utm_source')) {
    setC('snb_utm_source', utmSrc);
    if (utmMed) setC('snb_utm_medium', utmMed);
    if (utmCmp) setC('snb_utm_campaign', utmCmp);
    if (!getC('snb_src')) {
      var s = 'REFERRAL';
      if (utmMed && /cpc|paid|ad|ppc/i.test(utmMed)) s = 'ADS';
      else if (/facebook|fb|meta/i.test(utmSrc)) s = 'FACEBOOK';
      else if (/insta/i.test(utmSrc)) s = 'INSTAGRAM';
      else if (/google|bing|yahoo|duckduck/i.test(utmSrc)) s = 'SEO';
      else if (/tiktok/i.test(utmSrc)) s = 'TIKTOK';
      else if (/email|mail|newsletter/i.test(utmMed||utmSrc)) s = 'EMAIL';
      setC('snb_src', s);
    }
  }
  if (!getC('snb_src') && document.referrer && document.referrer.indexOf(location.host) === -1) {
    var ref = document.referrer.toLowerCase(), s;
    if (/google\\.|bing\\.|yahoo\\.|duckduckgo\\.|ecosia\\.|qwant\\./.test(ref)) s = 'SEO';
    else if (/facebook\\.|fb\\.|fbcdn\\./.test(ref)) s = 'FACEBOOK';
    else if (/instagram\\.|cdninstagram\\./.test(ref)) s = 'INSTAGRAM';
    else if (/tiktok\\./.test(ref)) s = 'TIKTOK';
    else if (/youtube\\.|youtu\\.be/.test(ref)) s = 'YOUTUBE';
    else if (/linkedin\\./.test(ref)) s = 'LINKEDIN';
    else if (/t\\.co|twitter\\.|x\\.com/.test(ref)) s = 'TWITTER';
    else if (/pinterest\\./.test(ref)) s = 'PINTEREST';
    else if (/wa\\.me|whatsapp\\./.test(ref)) s = 'WHATSAPP';
    else if (/chat\\.openai|chatgpt|claude\\.ai|gemini\\.google|perplexity/.test(ref)) s = 'LLM';
    else s = 'REFERRAL';
    setC('snb_src', s);
    setC('snb_referrer', document.referrer);
  }
  if (!getC('snb_landing')) setC('snb_landing', location.pathname);
  setTimeout(function(){ if (!getC('snb_src')) setC('snb_src', 'DIRECT'); }, 100);
})();
</script>
<!-- Visitor tracker -->
<script src="/reservation/js/snb-tracker.js" defer></script>`;

// Injected at end of <body> on legacy pages: GTM noscript fallback.
const NOSCRIPT = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PNKV3HG"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

// Detection keys used by callers to avoid double-injection.
const HEAD_KEY = 'snb-tracker.js';
const NOSCRIPT_KEY = 'ns.html?id=GTM-PNKV3HG';

/**
 * Returns headCustom with the canonical tracking guaranteed present.
 * @param {string} headCustom - current config.scripts.headCustom
 * @param {boolean} isLegacy - true only for the Shootnbox legacy site
 */
function ensureHead(headCustom, isLegacy) {
  const hc = headCustom || '';
  if (isLegacy && hc.indexOf(HEAD_KEY) === -1) {
    return hc ? HEAD + '\n' + hc : HEAD;
  }
  return hc;
}

/**
 * Returns bodyEndCustom with the GTM noscript guaranteed present.
 */
function ensureNoscript(bodyEndCustom, isLegacy) {
  const be = bodyEndCustom || '';
  if (isLegacy && be.indexOf(NOSCRIPT_KEY) === -1) {
    return be ? NOSCRIPT + '\n' + be : NOSCRIPT;
  }
  return be;
}

module.exports = { HEAD, NOSCRIPT, HEAD_KEY, NOSCRIPT_KEY, ensureHead, ensureNoscript };
