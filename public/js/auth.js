// Auth module for Gestionnaire de Site
const Auth = (function() {
    'use strict';

    let accessToken = null;
    let currentUser = null;
    let isRefreshing = false;
    let refreshQueue = [];

    // Restore token from sessionStorage if available
    try {
        accessToken = sessionStorage.getItem('access_token');
    } catch (e) {
        // sessionStorage may be unavailable
    }

    /**
     * Process queued requests after a token refresh attempt.
     * @param {string|null} newToken - The new token, or null if refresh failed.
     */
    function processRefreshQueue(newToken) {
        refreshQueue.forEach(function(pending) {
            if (newToken) {
                pending.resolve(newToken);
            } else {
                pending.reject(new Error('Token refresh failed'));
            }
        });
        refreshQueue = [];
    }

    /**
     * Attempt to refresh the access token.
     * @returns {Promise<string>} The new access token.
     */
    async function refreshToken() {
        // If already refreshing, queue this request
        if (isRefreshing) {
            return new Promise(function(resolve, reject) {
                refreshQueue.push({ resolve: resolve, reject: reject });
            });
        }

        isRefreshing = true;

        try {
            var res = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                throw new Error('Refresh failed with status ' + res.status);
            }

            var data = await res.json();
            accessToken = data.access_token || null;

            if (accessToken) {
                try {
                    sessionStorage.setItem('access_token', accessToken);
                } catch (e) {
                    // Ignore storage errors
                }
            }

            processRefreshQueue(accessToken);
            return accessToken;
        } catch (err) {
            accessToken = null;
            try {
                sessionStorage.removeItem('access_token');
            } catch (e) {
                // Ignore storage errors
            }
            processRefreshQueue(null);
            throw err;
        } finally {
            isRefreshing = false;
        }
    }

    /**
     * Wrapper around fetch that adds auth headers and auto-refreshes on 401.
     * @param {string} url - The URL to fetch.
     * @param {object} options - Fetch options.
     * @returns {Promise<Response>} The fetch response.
     */
    async function apiFetch(url, options) {
        if (!options) options = {};
        if (!options.headers) options.headers = {};

        // Always send cookies
        options.credentials = 'same-origin';

        // Add Authorization header if we have a token
        if (accessToken) {
            options.headers['Authorization'] = 'Bearer ' + accessToken;
        }

        // Set Content-Type for JSON bodies if not already set
        if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
        }

        var res = await fetch(url, options);

        // If 401, try to refresh the token and retry once
        if (res.status === 401) {
            try {
                var newToken = await refreshToken();
                // Retry the original request with the new token
                var retryOptions = Object.assign({}, options);
                retryOptions.headers = Object.assign({}, options.headers);
                if (newToken) {
                    retryOptions.headers['Authorization'] = 'Bearer ' + newToken;
                }
                return await fetch(url, retryOptions);
            } catch (refreshErr) {
                // Refresh failed, redirect to login
                redirectToLogin();
                throw refreshErr;
            }
        }

        return res;
    }

    /**
     * Redirect to the login page, preserving the current URL for post-login redirect.
     */
    function redirectToLogin() {
        // Clean up stored token
        accessToken = null;
        currentUser = null;
        try {
            sessionStorage.removeItem('access_token');
        } catch (e) {
            // Ignore
        }

        // Don't redirect if already on the login page
        if (window.location.pathname === '/login.html') return;

        var returnUrl = window.location.pathname + window.location.search;
        if (returnUrl && returnUrl !== '/' && returnUrl !== '/login.html') {
            window.location.href = '/login.html?redirect=' + encodeURIComponent(returnUrl);
        } else {
            window.location.href = '/login.html';
        }
    }

    /**
     * Check authentication status on page load.
     * Calls /api/auth/me to verify the session.
     * Redirects to login if not authenticated (unless already on login page).
     * @returns {Promise<object|null>} The current user, or null if on login page and not logged in.
     */
    async function init() {
        try {
            var res = await fetch('/api/auth/me', {
                credentials: 'same-origin',
                headers: accessToken ? { 'Authorization': 'Bearer ' + accessToken } : {}
            });

            if (res.ok) {
                var data = await res.json();
                currentUser = data.user || data;
                return currentUser;
            }

            // Try refreshing the token
            try {
                await refreshToken();
                var retryRes = await fetch('/api/auth/me', {
                    credentials: 'same-origin',
                    headers: accessToken ? { 'Authorization': 'Bearer ' + accessToken } : {}
                });

                if (retryRes.ok) {
                    var retryData = await retryRes.json();
                    currentUser = retryData.user || retryData;
                    return currentUser;
                }
            } catch (e) {
                // Refresh also failed
            }

            // Not authenticated
            if (window.location.pathname !== '/login.html') {
                redirectToLogin();
            }
            return null;
        } catch (err) {
            // Network error or server down
            if (window.location.pathname !== '/login.html') {
                redirectToLogin();
            }
            return null;
        }
    }

    /**
     * Get the current authenticated user.
     * @returns {object|null} The current user object.
     */
    function getUser() {
        return currentUser;
    }

    /**
     * Get the current access token.
     * @returns {string|null} The access token.
     */
    function getToken() {
        return accessToken;
    }

    /**
     * Log out the current user.
     * Calls the logout endpoint and redirects to the login page.
     */
    async function logout() {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {
            // Logout request may fail, still proceed with local cleanup
        }

        accessToken = null;
        currentUser = null;
        try {
            sessionStorage.removeItem('access_token');
        } catch (e) {
            // Ignore
        }

        window.location.href = '/login.html';
    }

    /**
     * Check if the current user has a specific role.
     * @param {string} role - The role to check (e.g., 'admin').
     * @returns {boolean}
     */
    function hasRole(role) {
        return currentUser && currentUser.role === role;
    }

    /**
     * Check if the current user is an admin.
     * @returns {boolean}
     */
    function isAdmin() {
        return hasRole('admin');
    }

    return {
        apiFetch: apiFetch,
        init: init,
        getUser: getUser,
        getToken: getToken,
        logout: logout,
        hasRole: hasRole,
        isAdmin: isAdmin
    };
})();
