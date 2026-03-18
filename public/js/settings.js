/**
 * Settings page frontend logic.
 * Loads site-config.json, populates forms, handles save/rebuild.
 */
(function() {
  'use strict';

  var config = {};
  var currentTab = 'identity';

  // ==================== Helpers ====================

  /**
   * Get a nested value from an object by dot-separated path.
   */
  function getByPath(obj, path) {
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
      if (current == null) return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  /**
   * Set a nested value on an object by dot-separated path.
   */
  function setByPath(obj, path, value) {
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined || current[parts[i]] === null) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  // ==================== Tab switching ====================

  function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    var tabs = document.querySelectorAll('.settings-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
    }

    // Update sections
    var sections = document.querySelectorAll('.settings-section');
    for (var j = 0; j < sections.length; j++) {
      sections[j].classList.toggle('active', sections[j].id === 'section-' + tabName);
    }
  }

  // ==================== Populate form fields ====================

  function populateFields() {
    var fields = document.querySelectorAll('[data-path]');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var path = field.getAttribute('data-path');
      var value = getByPath(config, path);

      if (field.type === 'checkbox') {
        field.checked = !!value;
      } else if (field.type === 'color') {
        field.value = value || '#000000';
        // Also update the companion text input
        var textId = field.id + '-text';
        var textInput = document.getElementById(textId);
        if (textInput) textInput.value = value || '#000000';
      } else if (field.type === 'number') {
        field.value = value != null ? value : '';
      } else {
        field.value = value != null ? value : '';
      }
    }
  }

  // ==================== Collect form data ====================

  function collectFields() {
    var result = {};
    var fields = document.querySelectorAll('[data-path]');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var path = field.getAttribute('data-path');
      var value;

      if (field.type === 'checkbox') {
        value = field.checked;
      } else if (field.type === 'number') {
        value = field.value !== '' ? parseInt(field.value, 10) : undefined;
        if (value !== undefined && isNaN(value)) value = undefined;
      } else if (field.type === 'color') {
        value = field.value;
      } else {
        value = field.value;
      }

      if (value !== undefined) {
        setByPath(result, path, value);
      }
    }
    return result;
  }

  // ==================== Color preview ====================

  function updateColorPreview() {
    var colorKeys = [
      { key: 'primary', label: 'Primaire' },
      { key: 'secondary', label: 'Secondaire' },
      { key: 'tertiary', label: 'Tertiaire' },
      { key: 'accent1', label: 'Accent 1' },
      { key: 'accent2', label: 'Accent 2' },
      { key: 'bgMain', label: 'Fond' },
      { key: 'bgAlt', label: 'Fond alt' },
      { key: 'textDark', label: 'Texte' }
    ];

    var container = document.getElementById('preview-colors');
    if (!container) return;

    var html = '';
    for (var i = 0; i < colorKeys.length; i++) {
      var colorId = 'color-' + colorKeys[i].key;
      var el = document.getElementById(colorId);
      var color = el ? el.value : '#000000';
      var isLight = isLightColor(color);
      var textColor = isLight ? '#1a0a22' : '#ffffff';

      html += '<div class="color-swatch" style="background:' + color + ';color:' + textColor + ';">';
      html += color;
      html += '<span class="color-swatch-label">' + colorKeys[i].label + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;

    // Update CTA preview
    updateCtaPreview();
    updateFontPreview();
  }

  function isLightColor(hex) {
    if (!hex || hex.length < 7) return true;
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }

  function updateCtaPreview() {
    var btn = document.getElementById('preview-cta');
    if (!btn) return;

    var primaryEl = document.getElementById('color-primary');
    var secondaryEl = document.getElementById('color-secondary');
    var radiusEl = document.getElementById('cta-borderRadius');
    var styleEl = document.getElementById('cta-style');
    var textEl = document.getElementById('cta-defaultText');

    var primary = primaryEl ? primaryEl.value : '#E51981';
    var secondary = secondaryEl ? secondaryEl.value : '#0250FF';
    var radius = radiusEl ? radiusEl.value : '50px';
    var style = styleEl ? styleEl.value : 'gradient';
    var text = textEl ? textEl.value : 'Nous contacter';

    btn.textContent = text || 'Nous contacter';
    btn.style.borderRadius = radius;

    if (style === 'gradient') {
      btn.style.background = 'linear-gradient(135deg, ' + primary + ', ' + secondary + ')';
      btn.style.color = '#fff';
      btn.style.border = 'none';
    } else if (style === 'solid') {
      btn.style.background = primary;
      btn.style.color = '#fff';
      btn.style.border = 'none';
    } else if (style === 'outline') {
      btn.style.background = 'transparent';
      btn.style.color = primary;
      btn.style.border = '2px solid ' + primary;
    } else {
      btn.style.background = 'transparent';
      btn.style.color = primary;
      btn.style.border = 'none';
    }
  }

  function updateFontPreview() {
    var fontMainEl = document.getElementById('typo-fontMain');
    var fontHeadingsEl = document.getElementById('typo-fontHeadings');
    var sample = document.getElementById('preview-fonts');
    if (!sample) return;

    var fontMain = fontMainEl ? fontMainEl.value : 'Raleway';
    var fontHeadings = fontHeadingsEl ? fontHeadingsEl.value : 'Raleway';

    var h3 = sample.querySelector('h3');
    var p = sample.querySelector('p');
    if (h3) h3.style.fontFamily = "'" + fontHeadings + "', sans-serif";
    if (p) p.style.fontFamily = "'" + fontMain + "', sans-serif";
  }

  // ==================== Color picker sync ====================

  function setupColorSync() {
    // Sync color input with text input
    var colorInputs = document.querySelectorAll('input[type="color"][data-path]');
    for (var i = 0; i < colorInputs.length; i++) {
      (function(colorInput) {
        var textId = colorInput.id + '-text';
        var textInput = document.getElementById(textId);

        colorInput.addEventListener('input', function() {
          if (textInput) textInput.value = colorInput.value;
          updateColorPreview();
        });

        if (textInput) {
          textInput.addEventListener('input', function() {
            var val = textInput.value;
            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
              colorInput.value = val;
              updateColorPreview();
            }
          });
        }
      })(colorInputs[i]);
    }
  }

  // ==================== Save & Rebuild ====================

  async function saveSettings() {
    var btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = 'Sauvegarde...';

    try {
      var data = collectFields();
      var response = await Auth.apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        var err = await response.json();
        throw new Error(err.error || 'Erreur');
      }

      var result = await response.json();
      config = result.config || config;
      Components.showToast('Configuration sauvegardee', 'success');
    } catch (err) {
      Components.showToast('Erreur: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sauvegarder';
    }
  }

  async function rebuildSite() {
    if (!confirm('Reconstruire le site ? Cela va regenerer toutes les pages.')) return;

    var btn = document.getElementById('btn-rebuild');
    btn.disabled = true;
    btn.textContent = 'Reconstruction...';

    try {
      var response = await Auth.apiFetch('/api/settings/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        var err = await response.json();
        throw new Error(err.error || 'Erreur');
      }

      Components.showToast('Site reconstruit avec succes', 'success');
    } catch (err) {
      Components.showToast('Erreur: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Reconstruire le site';
    }
  }

  // ==================== Load config ====================

  async function loadConfig() {
    try {
      var response = await Auth.apiFetch('/api/settings');
      if (!response.ok) throw new Error('Erreur ' + response.status);
      config = await response.json();
      populateFields();
      updateColorPreview();
    } catch (err) {
      Components.showToast('Erreur lors du chargement de la configuration', 'error');
      console.error('Settings load error:', err);
    }
  }

  // ==================== Init ====================

  function init() {
    // Tab switching
    var tabs = document.querySelectorAll('.settings-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function() {
        switchTab(this.getAttribute('data-tab'));
      });
    }

    // Color sync
    setupColorSync();

    // Live preview updates for CTA and font fields
    var liveFields = ['cta-borderRadius', 'cta-style', 'cta-hoverEffect', 'cta-defaultText', 'typo-fontMain', 'typo-fontHeadings'];
    for (var j = 0; j < liveFields.length; j++) {
      var el = document.getElementById(liveFields[j]);
      if (el) {
        el.addEventListener('input', updateColorPreview);
        el.addEventListener('change', updateColorPreview);
      }
    }

    // Save and rebuild buttons
    document.getElementById('btn-save').addEventListener('click', saveSettings);
    document.getElementById('btn-rebuild').addEventListener('click', rebuildSite);

    // Init page (navbar, auth check)
    Components.initPage().then(function(user) {
      if (!user || user.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      loadConfig();
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
