/**
 * Appearance theme. Persisted in localStorage (client-only, no backend) and
 * applied by setting `data-theme` on <html>; the per-theme token overrides live
 * in main.css. The edition colours (--primary/--accent) are set as inline styles
 * by the edition layer and are unaffected here; only the neutral surfaces
 * (bg/surface/border/text) and the semantic state colours change.
 *
 * Three modes are supported:
 *   - 'light'      — the default bright surfaces.
 *   - 'dark'       — dark surfaces for low-light use.
 *   - 'colorblind' — a high-contrast, colour-blind-safe palette (Okabe–Ito)
 *                    where success/danger/warning are distinguished by hue
 *                    *and* lightness so they read correctly under protanopia,
 *                    deuteranopia, tritanopia and monochromacy. Meaning is never
 *                    carried by colour alone (WCAG 1.4.1); icons and text always
 *                    accompany it.
 */

export type ThemeMode = 'light' | 'dark' | 'colorblind';

/** All selectable modes, in the order they appear in the appearance menu. */
export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'colorblind'];

const STORAGE_KEY = 'pssid-theme';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'colorblind';
}

/** Whether the user's OS is set to a dark colour scheme (guarded for SSR/jsdom). */
function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function getTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(saved)) return saved;
  } catch { /* localStorage unavailable */ }
  // No stored preference: honour the operating-system colour scheme so the app
  // respects a user who has chosen dark at the OS level (WCAG-aligned default).
  return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode = getTheme()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
}

export function setTheme(mode: ThemeMode): void {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  applyTheme(mode);
}

/**
 * Advance to the next mode in {@link THEME_MODES}, wrapping around. Used by the
 * keyboard shortcut and as a simple fallback control; the appearance menu sets a
 * mode directly with {@link setTheme}.
 */
export function toggleTheme(): ThemeMode {
  const current = getTheme();
  const idx = THEME_MODES.indexOf(current);
  const next = THEME_MODES[(idx + 1) % THEME_MODES.length];
  setTheme(next);
  return next;
}
