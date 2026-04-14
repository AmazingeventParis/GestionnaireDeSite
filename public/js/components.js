// Shared UI Components for Gestionnaire de Site
const Components = (function() {
    'use strict';

    // Navigation items configuration
    var navItems = [
        { label: 'Dashboard',   href: '/',               icon: null, adminOnly: false },
        { label: 'Pages',       href: '/pages.html',     icon: null, adminOnly: false },
        { label: 'Medias',      href: '/media.html',     icon: null, adminOnly: false },
        { label: 'Blocs',       href: '/blocks.html',    icon: null, adminOnly: false },
        { label: 'Blog',        href: '/blog.html',      icon: null, adminOnly: false },
        { label: 'Bannieres',  href: '/banners.html',   icon: null, adminOnly: false },
        { label: 'SEO',         href: '/seo.html',       icon: null, adminOnly: false },
        { label: 'Parametres',  href: '/settings.html',  icon: null, adminOnly: true },
        { label: 'Securite',    href: '/security.html',  icon: null, adminOnly: true },
        { label: 'Audit SEO',  href: '/audit.html',      icon: null, adminOnly: true },
        { label: 'Utilisateurs', href: '/users.html',    icon: null, adminOnly: true }
    ];

    // French month names for date formatting
    var frenchMonths = [
        'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'
    ];

    /**
     * Escape HTML to prevent XSS when inserting into innerHTML.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    /**
     * Format an ISO date string to French format "18 mars 2026 a 14:30".
     * @param {string} dateStr - ISO date string.
     * @returns {string} Formatted date string.
     */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;

            var day = d.getDate();
            var month = frenchMonths[d.getMonth()];
            var year = d.getFullYear();
            var hours = String(d.getHours()).padStart(2, '0');
            var minutes = String(d.getMinutes()).padStart(2, '0');

            return day + ' ' + month + ' ' + year + ' \u00e0 ' + hours + ':' + minutes;
        } catch (e) {
            return dateStr;
        }
    }

    /**
     * Build and insert the admin navbar.
     * @param {object} user - The current user object with at least { username/email, role }.
     */
    function buildNavbar(user) {
        var currentPath = window.location.pathname;
        // Normalize: treat /index.html as /
        if (currentPath === '/index.html') currentPath = '/';

        var isAdmin = user && user.role === 'admin';
        var displayName = escapeHtml(user ? (user.username || user.name || user.email || 'Utilisateur') : 'Utilisateur');
        var roleBadge = '';
        if (user && user.role) {
            var badgeClass = user.role === 'admin' ? 'badge-prod' : 'badge-infra';
            roleBadge = '<span class="badge ' + badgeClass + '" style="margin-left:6px;vertical-align:middle;">' + escapeHtml(user.role) + '</span>';
        }

        // Build links
        var linksHtml = '';
        for (var i = 0; i < navItems.length; i++) {
            var item = navItems[i];
            if (item.adminOnly && !isAdmin) continue;

            var isActive = currentPath === item.href ||
                (item.href !== '/' && currentPath.indexOf(item.href) === 0);
            var activeClass = isActive ? ' active' : '';

            linksHtml += '<a href="' + item.href + '" class="' + activeClass + '">' +
                escapeHtml(item.label) + '</a>';
        }

        var navHtml =
            '<a href="/" class="navbar-brand">Gestionnaire <span>de Site</span></a>' +
            '<div class="navbar-links">' + linksHtml + '</div>' +
            '<div class="navbar-user">' +
                '<span class="navbar-user-name">' + displayName + roleBadge + '</span>' +
                '<button class="btn btn-sm btn-secondary navbar-logout-btn" id="navbar-logout">Deconnexion</button>' +
            '</div>';

        // Find or create navbar element
        var navEl = document.getElementById('navbar');
        if (!navEl) {
            navEl = document.createElement('nav');
            navEl.id = 'navbar';
            navEl.className = 'navbar';
            document.body.insertBefore(navEl, document.body.firstChild);
        } else {
            navEl.className = 'navbar';
        }

        navEl.innerHTML = navHtml;

        // Bind logout button
        var logoutBtn = document.getElementById('navbar-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                Auth.logout();
            });
        }

        // Inject navbar-specific styles if not already present
        if (!document.getElementById('navbar-dynamic-styles')) {
            var style = document.createElement('style');
            style.id = 'navbar-dynamic-styles';
            style.textContent =
                '.navbar { flex-wrap: wrap; }' +
                '.navbar-user { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 14px; }' +
                '.navbar-user-name { color: #e6edf3; white-space: nowrap; }' +
                '.navbar-logout-btn { white-space: nowrap; }' +
                '@media (max-width: 768px) {' +
                '  .navbar-user { margin-left: 0; width: 100%; justify-content: space-between; order: 3; }' +
                '  .navbar-links { order: 2; width: 100%; overflow-x: auto; flex-wrap: nowrap; }' +
                '  .navbar-links::-webkit-scrollbar { display: none; }' +
                '}';
            document.head.appendChild(style);
        }
    }

    /**
     * Show a toast notification.
     * @param {string} message - The message to display.
     * @param {string} type - One of 'success', 'error', 'info'. Defaults to 'info'.
     */
    function showToast(message, type) {
        if (!type) type = 'info';

        // Ensure toast container exists
        var container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText =
                'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:400px;width:calc(100% - 32px);';
            document.body.appendChild(container);
        }

        var colors = {
            success: { bg: '#23863633', border: '#238636', text: '#3fb950', icon: '\u2713' },
            error:   { bg: '#f8514933', border: '#f85149', text: '#f85149', icon: '\u2717' },
            info:    { bg: '#58a6ff33', border: '#58a6ff', text: '#58a6ff', icon: '\u2139' }
        };
        var c = colors[type] || colors.info;

        var toast = document.createElement('div');
        toast.style.cssText =
            'background:' + c.bg + ';border:1px solid ' + c.border + ';color:' + c.text +
            ';padding:12px 16px;border-radius:8px;font-size:14px;pointer-events:auto;' +
            'display:flex;align-items:center;gap:10px;animation:toastIn 0.3s ease;' +
            'backdrop-filter:blur(8px);';
        toast.innerHTML =
            '<span style="font-weight:700;font-size:16px;flex-shrink:0;">' + c.icon + '</span>' +
            '<span style="flex:1;">' + escapeHtml(message) + '</span>' +
            '<button style="background:none;border:none;color:' + c.text + ';cursor:pointer;font-size:18px;padding:0 2px;line-height:1;flex-shrink:0;" title="Fermer">\u00d7</button>';

        // Close button handler
        toast.querySelector('button').addEventListener('click', function() {
            removeToast(toast);
        });

        container.appendChild(toast);

        // Inject toast animation if needed
        if (!document.getElementById('toast-animation-styles')) {
            var style = document.createElement('style');
            style.id = 'toast-animation-styles';
            style.textContent =
                '@keyframes toastIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }' +
                '@keyframes toastOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(40px); } }';
            document.head.appendChild(style);
        }

        // Auto remove after 3 seconds
        var timeoutId = setTimeout(function() { removeToast(toast); }, 3000);
        toast._timeoutId = timeoutId;
    }

    /**
     * Remove a toast element with animation.
     */
    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        if (toast._timeoutId) clearTimeout(toast._timeoutId);
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }

    /**
     * Show a confirmation modal.
     * @param {string} message - The message to display.
     * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
     */
    function showConfirm(message) {
        return new Promise(function(resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'modal-overlay';

            var modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML =
                '<div class="modal-title">Confirmation</div>' +
                '<p style="color:#8b949e;font-size:14px;line-height:1.6;margin-bottom:0;">' + escapeHtml(message) + '</p>' +
                '<div class="modal-actions">' +
                    '<button class="btn btn-secondary" id="confirm-cancel">Annuler</button>' +
                    '<button class="btn btn-primary" id="confirm-ok">Confirmer</button>' +
                '</div>';

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Focus the confirm button
            var confirmBtn = modal.querySelector('#confirm-ok');
            var cancelBtn = modal.querySelector('#confirm-cancel');
            confirmBtn.focus();

            function cleanup(result) {
                overlay.remove();
                document.removeEventListener('keydown', keyHandler);
                resolve(result);
            }

            cancelBtn.addEventListener('click', function() { cleanup(false); });
            confirmBtn.addEventListener('click', function() { cleanup(true); });

            // Close on overlay click (outside modal)
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) cleanup(false);
            });

            // Close on Escape, confirm on Enter
            function keyHandler(e) {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            }
            document.addEventListener('keydown', keyHandler);
        });
    }

    /**
     * Initialize a page: check auth, then build navbar.
     * Call this on every protected page.
     * @returns {Promise<object|null>} The current user, or null if redirected to login.
     */
    async function initPage() {
        var user = await Auth.init();
        if (user) {
            buildNavbar(user);
        }
        return user;
    }

    return {
        buildNavbar: buildNavbar,
        showToast: showToast,
        showConfirm: showConfirm,
        escapeHtml: escapeHtml,
        formatDate: formatDate,
        initPage: initPage
    };
})();
