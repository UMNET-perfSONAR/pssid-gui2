/**
 * Edition registry.
 *
 * The pSSID GUI is a single codebase that can present a different appearance
 * (product name, palette, logo glyph) for each organization, without forking.
 * The active edition is selected at deploy time via the `VITE_EDITION`
 * environment variable (see ./index.ts). Add a new entry here for another
 * organization.
 *
 * `*Rgb` values are the comma-separated channels of the matching hex colour so
 * that translucent tints can be expressed as `rgba(var(--primary-rgb), .08)`
 * in CSS and still follow the active edition.
 */

export interface EditionColors {
  /** Primary surface colour: navbar, primary buttons, accents on light bg. */
  primary: string;
  /** Darker shade of primary, used for hover/pressed states. */
  primaryDark: string;
  /** RGB channels of `primary`, e.g. "0,39,76". */
  primaryRgb: string;
  /** Accent colour: active indicators, highlights, warning buttons. */
  accent: string;
  /** RGB channels of `accent`. */
  accentRgb: string;
  /** Readable text colour to place on top of `accent`. */
  accentText: string;
}

export interface Edition {
  /** Stable identifier; matches the VITE_EDITION value. */
  id: string;
  /** Full product name, used for document.title. */
  productName: string;
  /** Leading navbar word, e.g. "pSSID". */
  shortName: string;
  /** Emphasised (accent-coloured) navbar word, e.g. "GUI". */
  emphasis: string;
  /** Owning organisation; shown where a sponsor label is appropriate. "" hides it. */
  org: string;
  /** Short marketing line for docs/landing surfaces. */
  tagline: string;
  /** Material Icons glyph for the navbar logo mark. */
  glyph: string;
  /** Version pill text shown in the navbar. */
  version: string;
  colors: EditionColors;
}

export const editions: Record<string, Edition> = {
  /**
   * Neutral, vendor-agnostic edition. A secure deep-navy + cyan identity that
   * reads as a trustworthy wireless/networking product for any organisation.
   *
   * To brand the interface for an organisation, add another entry here with
   * that organisation's palette and product name, then deploy with
   * `VITE_EDITION=<id>` (see ./index.ts).
   */
  default: {
    id: 'default',
    productName: 'pSSID GUI',
    shortName: 'pSSID',
    emphasis: 'GUI',
    org: '',
    tagline: 'Wireless measurement orchestration for any network.',
    glyph: 'wifi',
    version: 'v1',
    colors: {
      primary: '#0b2545',
      primaryDark: '#081a33',
      primaryRgb: '11,37,69',
      accent: '#06b6d4',
      accentRgb: '6,182,212',
      accentText: '#04222b',
    },
  },
};

export const DEFAULT_EDITION_ID = 'default';
