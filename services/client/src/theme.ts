/**
 * Light/dark theme. Persisted in localStorage (client-only, no backend) and
 * applied by toggling `data-theme="dark"` on <html>; the dark token overrides
 * live in main.css. The edition colours (--primary/--accent) are unaffected;
 * only the neutral surfaces (bg/surface/border/text) change.
 */

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'pssid-theme';

export function getTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* localStorage unavailable */ }
  return 'light';
}

export function applyTheme(mode: ThemeMode = getTheme()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
}

export function setTheme(mode: ThemeMode): void {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  applyTheme(mode);
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
