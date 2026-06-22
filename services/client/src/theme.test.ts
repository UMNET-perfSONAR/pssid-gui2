// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getTheme, setTheme, toggleTheme, applyTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light when nothing is stored', () => {
    expect(getTheme()).toBe('light');
  });

  it('persists and applies a chosen theme', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles between light and dark', () => {
    expect(toggleTheme()).toBe('dark');
    expect(toggleTheme()).toBe('light');
  });

  it('applyTheme reflects the stored value onto the document', () => {
    setTheme('dark');
    document.documentElement.removeAttribute('data-theme');
    applyTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
