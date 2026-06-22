import { describe, it, expect } from 'vitest';
import { editions, DEFAULT_EDITION_ID } from '../editions';

describe('edition registry', () => {
  it('includes the default and umich editions', () => {
    expect(editions).toHaveProperty('default');
    expect(editions).toHaveProperty('umich');
    expect(editions[DEFAULT_EDITION_ID]).toBeDefined();
  });

  it('every edition defines a complete, consistent color palette', () => {
    for (const [id, edition] of Object.entries(editions)) {
      expect(edition.id, `${id}.id`).toBe(id);
      expect(edition.productName, `${id}.productName`).toBeTruthy();
      const c = edition.colors;
      for (const key of ['primary', 'primaryDark', 'primaryRgb', 'accent', 'accentRgb', 'accentText'] as const) {
        expect(c[key], `${id}.colors.${key}`).toBeTruthy();
      }
      // hex colors look like #rrggbb / #rgb
      expect(c.primary).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(c.accent).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      // rgb triples are three comma-separated numbers
      expect(c.primaryRgb).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/);
      expect(c.accentRgb).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/);
    }
  });

  it('preserves the UMich navy/maize identity', () => {
    expect(editions.umich.colors.primary.toLowerCase()).toBe('#00274c');
    expect(editions.umich.colors.accent.toLowerCase()).toBe('#ffcb05');
  });
});
