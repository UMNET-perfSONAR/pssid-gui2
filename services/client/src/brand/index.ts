/**
 * Brand resolution + runtime application.
 *
 * The active brand is chosen from the `VITE_BRAND` build/deploy variable. We
 * apply it at runtime (setting CSS custom properties on :root) rather than at
 * build time, so the same image works for any brand and there is no risk of a
 * CSS purge dropping brand colours. If `VITE_BRAND` is unset or unknown we fall
 * back to the neutral default — the app always renders with a valid identity.
 */

import { brands, DEFAULT_BRAND_ID, type Brand } from './brands';

function resolveBrandId(): string {
  const raw = (import.meta.env.VITE_BRAND as string | undefined)?.trim();
  return raw && brands[raw] ? raw : DEFAULT_BRAND_ID;
}

export const activeBrand: Brand = brands[resolveBrandId()];

/** Build a small wifi-themed SVG favicon tinted to the active brand. */
function brandFavicon(brand: Brand): string {
  const { primary, accent } = brand.colors;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
    `<rect width='64' height='64' rx='14' fill='${primary}'/>` +
    `<path d='M14 30a26 26 0 0 1 36 0' fill='none' stroke='${accent}' stroke-width='5' stroke-linecap='round'/>` +
    `<path d='M21 38a16 16 0 0 1 22 0' fill='none' stroke='${accent}' stroke-width='5' stroke-linecap='round'/>` +
    `<circle cx='32' cy='46' r='4.5' fill='${accent}'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Apply the brand to the live document: palette tokens, page title, favicon.
 * Safe to call once at startup (see main.ts).
 */
export function applyBrand(brand: Brand = activeBrand): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const c = brand.colors;
  root.style.setProperty('--primary', c.primary);
  root.style.setProperty('--primary-dark', c.primaryDark);
  root.style.setProperty('--primary-rgb', c.primaryRgb);
  root.style.setProperty('--accent', c.accent);
  root.style.setProperty('--accent-rgb', c.accentRgb);
  root.style.setProperty('--accent-text', c.accentText);

  document.title = brand.productName;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = brandFavicon(brand);
}

export type { Brand } from './brands';
