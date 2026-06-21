/**
 * Brand registry — white-label support.
 *
 * The pSSID GUI ships as a single codebase that can present different brand
 * identities (product name, palette, logo glyph) without forking. The active
 * brand is selected at deploy time via the `VITE_BRAND` environment variable
 * (see ./index.ts). Add a new entry here to onboard another organisation.
 *
 * `*Rgb` values are the comma-separated channels of the matching hex colour so
 * that translucent tints can be expressed as `rgba(var(--primary-rgb), .08)`
 * in CSS and still track the active brand.
 */

export interface BrandColors {
  /** Primary surface colour — navbar, primary buttons, accents on light bg. */
  primary: string;
  /** Darker shade of primary, used for hover/pressed states. */
  primaryDark: string;
  /** RGB channels of `primary`, e.g. "0,39,76". */
  primaryRgb: string;
  /** Accent colour — active indicators, highlights, warning buttons. */
  accent: string;
  /** RGB channels of `accent`. */
  accentRgb: string;
  /** Readable text colour to place on top of `accent`. */
  accentText: string;
}

export interface Brand {
  /** Stable identifier; matches the VITE_BRAND value. */
  id: string;
  /** Full product name — used for document.title. */
  productName: string;
  /** Leading navbar word, e.g. "pSSID". */
  shortName: string;
  /** Emphasised (accent-coloured) navbar word, e.g. "GUI". */
  emphasis: string;
  /** Owning organisation; shown where a sponsor label is appropriate. "" hides it. */
  org: string;
  /** Short marketing line for docs/landing surfaces. */
  tagline: string;
  /** Material Icons glyph for the navbar brand mark. */
  glyph: string;
  /** Version pill text shown in the navbar. */
  version: string;
  colors: BrandColors;
}

export const brands: Record<string, Brand> = {
  /**
   * University of Michigan edition — preserves the existing navy/maize identity
   * exactly so current UMich users see no visual change.
   */
  umich: {
    id: 'umich',
    productName: 'pSSID GUI · University of Michigan',
    shortName: 'pSSID',
    emphasis: 'GUI',
    org: 'University of Michigan',
    tagline: 'Wireless measurement orchestration for the University of Michigan.',
    glyph: 'wifi',
    version: 'v2.0',
    colors: {
      primary: '#00274C',
      primaryDark: '#001e3d',
      primaryRgb: '0,39,76',
      accent: '#FFCB05',
      accentRgb: '255,203,5',
      accentText: '#00274C',
    },
  },

  /**
   * Neutral, vendor-agnostic edition. A secure deep-navy + cyan identity that
   * reads as a trustworthy wireless/networking product for any organisation.
   */
  default: {
    id: 'default',
    productName: 'pSSID GUI',
    shortName: 'pSSID',
    emphasis: 'GUI',
    org: '',
    tagline: 'Wireless measurement orchestration for any network.',
    glyph: 'wifi',
    version: 'v2.0',
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

export const DEFAULT_BRAND_ID = 'default';
