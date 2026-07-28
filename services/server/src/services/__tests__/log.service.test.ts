import { describe, it, expect } from 'vitest';
import { forLog } from '../log.service';

// forLog guards the plain console.log lines (the audit trail protects itself
// with JSON.stringify). What matters is that a value arriving from a request
// URL or an identity-provider claim cannot end the line it is written on.

describe('forLog', () => {
  it('keeps an ordinary value unchanged', () => {
    expect(forLog('probe-01.example.edu')).toBe('probe-01.example.edu');
    expect(forLog('*')).toBe('*');
  });

  it('neutralises the newlines that would forge a second log entry', () => {
    expect(forLog('probe\nAUDIT {"actor":"admin"}')).toBe('probe?AUDIT {"actor":"admin"}');
    expect(forLog('a\r\nb')).toBe('a??b');
  });

  it('neutralises terminal escape sequences', () => {
    expect(forLog('\u001b[31mred\u001b[0m')).toBe('?[31mred?[0m');
    expect(forLog('nul\u0000byte')).toBe('nul?byte');
    expect(forLog('del\u007fchar')).toBe('del?char');
  });

  it('bounds the length so one field cannot swamp a line', () => {
    const out = forLog('x'.repeat(500));
    expect(out).toHaveLength(203);
    expect(out.endsWith('...')).toBe(true);
  });

  it('renders a non-string without throwing', () => {
    expect(forLog(undefined)).toBe('undefined');
    expect(forLog(42)).toBe('42');
    expect(forLog({ $ne: null })).toBe('[object Object]');
  });
});
