/**
 * Responsive Preview Module
 * Controls editor iframe sizing for previewing pages at different device sizes.
 */
var ResponsivePreview = (function() {
  'use strict';

  var iframe = null;
  var toolbarContainer = null;
  var iframeArea = null;
  var currentDevice = 'desktop';
  var isRotated = false;
  var isSideBySide = false;
  var currentZoom = 1;
  var secondIframe = null;

  var devices = {
    desktop: { w: 1920, h: 1080, label: 'Desktop', icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 000 3.5v7A1.5 1.5 0 001.5 12H6v2H4.5a.5.5 0 000 1h7a.5.5 0 000-1H9.5v-2h4.5a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014 2H1.5zM1 3.5a.5.5 0 01.5-.5h13a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5v-7z"/></svg>' },
    laptop: { w: 1366, h: 768, label: 'Laptop', icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 3a.5.5 0 01.5.5V11H2V3.5a.5.5 0 01.5-.5h11zm-11-1A1.5 1.5 0 001 3.5V12h14V3.5A1.5 1.5 0 0013.5 2h-11zM0 12.5h16a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 12.5z"/></svg>' },
    tablet: { w: 768, h: 1024, label: 'Tablet', icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12 1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1h8zM4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V2a2 2 0 00-2-2H4z"/><path d="M8 14a1 1 0 100-2 1 1 0 000 2z"/></svg>' },
    mobile: { w: 375, h: 812, label: 'Mobile', icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V2a1 1 0 011-1h6zM5 0a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V2a2 2 0 00-2-2H5z"/><path d="M8 14a1 1 0 100-2 1 1 0 000 2z"/></svg>' }
  };

  /**
   * Build the toolbar HTML.
   */
  function buildToolbar() {
    var html = '<div class="rp-toolbar">';
    html += '<div class="rp-toolbar-group">';

    // Device buttons
    var deviceNames = ['desktop', 'laptop', 'tablet', 'mobile'];
    for (var i = 0; i < deviceNames.length; i++) {
      var name = deviceNames[i];
      var device = devices[name];
      var active = name === currentDevice ? ' active' : '';
      html += '<button class="rp-device-btn' + active + '" data-device="' + name + '" title="' + device.label + ' (' + device.w + 'x' + device.h + ')">';
      html += device.icon;
      html += '<span class="rp-device-label">' + device.label + '</span>';
      html += '</button>';
    }

    html += '</div>';
    html += '<div class="rp-toolbar-divider"></div>';
    html += '<div class="rp-toolbar-group">';

    // Side-by-side button
    html += '<button class="rp-device-btn' + (isSideBySide ? ' active' : '') + '" id="rp-side-by-side" title="Vue cote a cote">';
    html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 2.5A1.5 1.5 0 011.5 1h13A1.5 1.5 0 0116 2.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 13.5v-11zM1.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5H7V2H1.5zM8.5 2v12h6a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5H8.5z"/></svg>';
    html += '<span class="rp-device-label">Side</span>';
    html += '</button>';

    // Rotation button (for tablet)
    html += '<button class="rp-device-btn' + (isRotated ? ' active' : '') + '" id="rp-rotate" title="Rotation">';
    html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.418A6 6 0 118 2v1z"/><path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966a.25.25 0 010 .384L8.41 4.658A.25.25 0 018 4.466z"/></svg>';
    html += '<span class="rp-device-label">Rotation</span>';
    html += '</button>';

    html += '</div>';
    html += '<div class="rp-toolbar-divider"></div>';
    html += '<div class="rp-toolbar-group rp-zoom-group">';

    // Zoom slider
    html += '<span class="rp-zoom-label" id="rp-zoom-value">' + Math.round(currentZoom * 100) + '%</span>';
    html += '<input type="range" class="rp-zoom-slider" id="rp-zoom-slider" min="25" max="150" value="' + Math.round(currentZoom * 100) + '" step="5">';
    html += '<button class="rp-device-btn rp-zoom-fit" id="rp-zoom-fit" title="Ajuster a la fenetre">';
    html += '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1a.5.5 0 00-.5.5v4a.5.5 0 01-1 0v-4A1.5 1.5 0 011.5 0h4a.5.5 0 010 1h-4zM10 .5a.5.5 0 01.5-.5h4A1.5 1.5 0 0116 1.5v4a.5.5 0 01-1 0v-4a.5.5 0 00-.5-.5h-4a.5.5 0 01-.5-.5zM.5 10a.5.5 0 01.5.5v4a.5.5 0 00.5.5h4a.5.5 0 010 1h-4A1.5 1.5 0 010 14.5v-4a.5.5 0 01.5-.5zm15 0a.5.5 0 01.5.5v4a1.5 1.5 0 01-1.5 1.5h-4a.5.5 0 010-1h4a.5.5 0 00.5-.5v-4a.5.5 0 01.5-.5z"/></svg>';
    html += '</button>';

    html += '</div>';

    // Size indicator
    html += '<div class="rp-toolbar-spacer"></div>';
    html += '<span class="rp-size-indicator" id="rp-size-indicator"></span>';

    html += '</div>';
    return html;
  }

  /**
   * Calculate the optimal scale to fit the iframe in the visible area.
   */
  function calculateFitScale(deviceW, deviceH) {
    if (!iframeArea) return 1;
    var areaRect = iframeArea.getBoundingClientRect();
    var availW = areaRect.width - 32; // padding
    var availH = areaRect.height - 32;
    var scaleW = availW / deviceW;
    var scaleH = availH / deviceH;
    return Math.min(scaleW, scaleH, 1);
  }

  /**
   * Apply the current device size and zoom to the iframe.
   */
  function applySize() {
    if (!iframe) return;

    var device = devices[currentDevice];
    var w = isRotated ? device.h : device.w;
    var h = isRotated ? device.w : device.h;

    iframe.style.width = w + 'px';
    iframe.style.height = h + 'px';
    iframe.style.transform = 'scale(' + currentZoom + ')';
    iframe.style.transformOrigin = 'top center';

    // Update size indicator
    var indicator = document.getElementById('rp-size-indicator');
    if (indicator) {
      indicator.textContent = w + ' x ' + h;
    }
  }

  /**
   * Set the active device preset.
   */
  function setDevice(name) {
    if (!devices[name]) return;
    currentDevice = name;
    isRotated = false;
    isSideBySide = false;

    // Remove side-by-side
    removeSideBySide();

    // Auto-fit zoom
    var device = devices[name];
    currentZoom = calculateFitScale(device.w, device.h);

    applySize();
    updateToolbar();
    updateZoomSlider();
  }

  /**
   * Toggle side-by-side mode.
   */
  function toggleSideBySide() {
    isSideBySide = !isSideBySide;

    if (isSideBySide) {
      if (!iframeArea) return;

      // Create a second iframe for mobile
      iframeArea.classList.add('rp-side-by-side');

      var src = iframe.src;
      secondIframe = document.createElement('iframe');
      secondIframe.id = 'editor-frame-mobile';
      secondIframe.className = 'rp-frame rp-frame-mobile';
      secondIframe.src = src;
      iframeArea.appendChild(secondIframe);

      // Resize both
      var areaRect = iframeArea.getBoundingClientRect();
      var halfW = (areaRect.width - 48) / 2;

      // Desktop iframe
      var deskScale = Math.min(halfW / 1920, (areaRect.height - 32) / 1080, 1);
      iframe.style.width = '1920px';
      iframe.style.height = '1080px';
      iframe.style.transform = 'scale(' + deskScale + ')';
      iframe.style.transformOrigin = 'top left';

      // Mobile iframe
      var mobScale = Math.min(halfW / 375, (areaRect.height - 32) / 812, 1);
      secondIframe.style.width = '375px';
      secondIframe.style.height = '812px';
      secondIframe.style.transform = 'scale(' + mobScale + ')';
      secondIframe.style.transformOrigin = 'top left';
      secondIframe.style.border = 'none';
      secondIframe.style.background = '#fff';
      secondIframe.style.borderRadius = '4px';
      secondIframe.style.boxShadow = '0 0 0 1px #30363d, 0 8px 32px rgba(0,0,0,0.4)';
    } else {
      removeSideBySide();
      applySize();
    }

    updateToolbar();
  }

  /**
   * Remove the side-by-side second iframe.
   */
  function removeSideBySide() {
    if (secondIframe && secondIframe.parentNode) {
      secondIframe.parentNode.removeChild(secondIframe);
      secondIframe = null;
    }
    if (iframeArea) {
      iframeArea.classList.remove('rp-side-by-side');
    }
    if (iframe) {
      iframe.style.transformOrigin = 'top center';
    }
  }

  /**
   * Toggle rotation (swap width/height).
   */
  function toggleRotation() {
    isRotated = !isRotated;
    var device = devices[currentDevice];
    var w = isRotated ? device.h : device.w;
    var h = isRotated ? device.w : device.h;
    currentZoom = calculateFitScale(w, h);
    applySize();
    updateToolbar();
    updateZoomSlider();
  }

  /**
   * Set the zoom level.
   */
  function setZoom(level) {
    currentZoom = Math.max(0.25, Math.min(1.5, level));
    applySize();
    var zoomValue = document.getElementById('rp-zoom-value');
    if (zoomValue) {
      zoomValue.textContent = Math.round(currentZoom * 100) + '%';
    }
  }

  /**
   * Fit zoom to the visible area.
   */
  function fitToArea() {
    var device = devices[currentDevice];
    var w = isRotated ? device.h : device.w;
    var h = isRotated ? device.w : device.h;
    currentZoom = calculateFitScale(w, h);
    applySize();
    updateZoomSlider();
  }

  /**
   * Update the zoom slider UI.
   */
  function updateZoomSlider() {
    var slider = document.getElementById('rp-zoom-slider');
    var zoomValue = document.getElementById('rp-zoom-value');
    if (slider) slider.value = Math.round(currentZoom * 100);
    if (zoomValue) zoomValue.textContent = Math.round(currentZoom * 100) + '%';
  }

  /**
   * Update toolbar button active states.
   */
  function updateToolbar() {
    if (!toolbarContainer) return;
    // Re-render toolbar
    toolbarContainer.innerHTML = buildToolbar();
    bindToolbarEvents();
  }

  /**
   * Bind event listeners to toolbar buttons.
   */
  function bindToolbarEvents() {
    // Device buttons
    var deviceBtns = toolbarContainer.querySelectorAll('.rp-device-btn[data-device]');
    for (var i = 0; i < deviceBtns.length; i++) {
      deviceBtns[i].addEventListener('click', function() {
        setDevice(this.getAttribute('data-device'));
      });
    }

    // Side-by-side
    var sideBtn = document.getElementById('rp-side-by-side');
    if (sideBtn) sideBtn.addEventListener('click', toggleSideBySide);

    // Rotate
    var rotateBtn = document.getElementById('rp-rotate');
    if (rotateBtn) rotateBtn.addEventListener('click', toggleRotation);

    // Zoom slider
    var zoomSlider = document.getElementById('rp-zoom-slider');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', function() {
        setZoom(parseInt(this.value, 10) / 100);
      });
    }

    // Zoom fit
    var fitBtn = document.getElementById('rp-zoom-fit');
    if (fitBtn) fitBtn.addEventListener('click', fitToArea);
  }

  /**
   * Initialize the responsive preview module.
   * @param {string} iframeId - The ID of the iframe element.
   * @param {string} toolbarId - The ID of the toolbar container element.
   * @param {string} areaId - The ID of the iframe area container.
   */
  function init(iframeId, toolbarId, areaId) {
    iframe = document.getElementById(iframeId);
    toolbarContainer = document.getElementById(toolbarId);
    iframeArea = document.getElementById(areaId);

    if (!iframe || !toolbarContainer) {
      console.warn('[ResponsivePreview] Missing iframe or toolbar element');
      return;
    }

    // Render toolbar
    toolbarContainer.innerHTML = buildToolbar();
    bindToolbarEvents();

    // Set initial device to desktop, fit to area
    setDevice('desktop');

    // Re-fit on window resize
    window.addEventListener('resize', function() {
      if (!isSideBySide) {
        fitToArea();
      }
    });
  }

  // Public API
  return {
    init: init,
    setDevice: setDevice,
    toggleSideBySide: toggleSideBySide,
    toggleRotation: toggleRotation,
    setZoom: setZoom,
    devices: devices
  };
})();
