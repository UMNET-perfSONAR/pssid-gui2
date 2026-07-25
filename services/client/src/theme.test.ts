// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getTheme, setTheme, toggleTheme, applyTheme, THEME_MODES } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light when nothing is stored (no matchMedia in jsdom)', () => {
    expect(getTheme()).toBe('light');
  });

  it('exposes the three selectable modes in menu order', () => {
    expect(THEME_MODES).toEqual(['light', 'dark', 'accessible']);
  });

  it('persists and applies a chosen theme', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists and applies the accessible (high-contrast) theme', () => {
    setTheme('accessible');
    expect(getTheme()).toBe('accessible');
    expect(document.documentElement.getAttribute('data-theme')).toBe('accessible');
  });

  it('ignores an unrecognized stored value and falls back to the default', () => {
    localStorage.setItem('pssid-theme', 'neon');
    expect(getTheme()).toBe('light');
  });

  it('cycles light -> dark -> accessible -> light', () => {
    setTheme('light');
    expect(toggleTheme()).toBe('dark');
    expect(toggleTheme()).toBe('accessible');
    expect(toggleTheme()).toBe('light');
  });

  it('applyTheme reflects the stored value onto the document', () => {
    setTheme('accessible');
    document.documentElement.removeAttribute('data-theme');
    applyTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('accessible');
  });
});
