/**
 * Pre-paint theme bootstrap.
 *
 * src/theme.ts is the source of truth for the theme, but it is part of the
 * application bundle, which is a module script and therefore deferred: the
 * browser parses the HTML, applies the stylesheet, and PAINTS before any of it
 * runs. Until then <html> carries no data-theme, so the `:root` defaults apply
 * and the first painted frame is the light theme -- a flash of light surfaces
 * on every load and reload for anyone using dark mode, and a visible seam where
 * the light and dark backgrounds meet as the swap happens.
 *
 * This file is a plain (non-module, non-deferred) script loaded from <head>, so
 * it runs BEFORE the first paint and sets the attribute in time. It is a
 * separate file rather than an inline <script> because the deployment's
 * Content-Security-Policy is `script-src 'self'` (see nginx.conf), which blocks
 * inline script but allows a same-origin file.
 *
 * It deliberately duplicates a few lines of getTheme() from src/theme.ts, which
 * is unavoidable: the bundle cannot run this early. Keep the storage key, the
 * valid modes, and the system-preference fallback in step with that file.
 */
(function () {
  try {
    var STORAGE_KEY = 'pssid-theme';
    var VALID = ['light', 'dark', 'colorblind'];

    var mode = null;
    try {
      mode = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      /* localStorage unavailable (private mode, blocked cookies) */
    }

    if (VALID.indexOf(mode) === -1) {
      // No stored preference: honour the operating-system colour scheme, the
      // same default getTheme() falls back to.
      var prefersDark = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches;
      mode = prefersDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', mode);
  } catch (e) {
    /* Never block rendering: applyTheme() in the bundle still runs at startup
       and will set the attribute a moment later. */
  }
})();
