import { describe, it, expect } from 'vitest';
import {
  validName,
  validDisplayName,
  validHostOrIp,
  validSsidNetworkName,
  validSingleToken,
  validInterfaceName,
  validWholeNumber,
  validIso8601Duration,
  validJqClause,
  validCron,
  describeCron,
  cronPeriodMinutes,
} from '../validators';

// Every form field validator in one place. Each case states the rule it pins.

describe('validName (RFC 1123: host/group/profile names)', () => {
  it.each(['probe-1', 'a', 'lab.example.edu', 'A-1.b-2', '0start'])(
    'accepts %s', (v) => expect(validName(v).valid).toBe(true));

  it.each([
    ['', 'empty'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['under_score', 'underscore'],
    ['spa ce', 'space'],
    ['a..b', 'empty label'],
    ['x'.repeat(64), 'label over 63 chars'],
  ])('rejects %s (%s)', (v) => {
    const r = validName(v);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('rejects names over 253 characters total', () => {
    const long = Array(64).fill('abc').join('.');
    expect(validName(long).valid).toBe(false);
  });
});

describe('validDisplayName (human-readable labels, e.g. schedule names)', () => {
  it.each([
    'Every 5 minutes',
    'Every 1 hour',
    'Every 4 hours',
    'Every day at 23:00',   // the shipped defaults must all pass
    'scheduled-run_v2.1',
  ])('accepts %s', (v) => expect(validDisplayName(v).valid).toBe(true));

  it.each([
    ['', 'empty'],
    ['-starts with hyphen', 'must start with letter or digit'],
    ['bad[name]', 'brackets'],
    ['line\nbreak', 'newline'],
    ['x'.repeat(130), 'over 128 characters'],
  ])('rejects %s (%s)', (v) => {
    const r = validDisplayName(v);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('validHostOrIp (hosts may also be addresses)', () => {
  it.each(['10.0.0.1', '255.255.255.255', '::1', 'fe80::a:b', 'probe.example.edu'])(
    'accepts %s', (v) => expect(validHostOrIp(v).valid).toBe(true));

  it.each(['999.1.1.1', '1.2.3', 'not valid!', ''])(
    'rejects %s', (v) => expect(validHostOrIp(v).valid).toBe(false));
});

describe('validSsidNetworkName (IEEE 802.11: 1-32 bytes)', () => {
  it.each(['MWireless', 'Campus WiFi', 'a', 'x'.repeat(32)])(
    'accepts %s', (v) => expect(validSsidNetworkName(v).valid).toBe(true));

  it('rejects empty and over 32 bytes', () => {
    expect(validSsidNetworkName('').valid).toBe(false);
    expect(validSsidNetworkName('x'.repeat(33)).valid).toBe(false);
  });

  it('counts bytes, not characters (multi-byte UTF-8)', () => {
    // 11 four-byte emoji = 44 bytes, over the limit despite 11 characters.
    expect(validSsidNetworkName('\u{1F600}'.repeat(11)).valid).toBe(false);
  });

  it('rejects control characters and leading/trailing spaces', () => {
    expect(validSsidNetworkName('bad\x00ssid').valid).toBe(false);
    expect(validSsidNetworkName('tab\tssid').valid).toBe(false);
    expect(validSsidNetworkName(' padded').valid).toBe(false);
    expect(validSsidNetworkName('padded ').valid).toBe(false);
  });
});

describe('validSingleToken (layer 2/3 method names)', () => {
  it.each(['wpa_supplicant', 'dhcp.v4', 'a-b_c.d'])(
    'accepts %s', (v) => expect(validSingleToken(v).valid).toBe(true));

  it.each(['has space', '../traversal', 'semi;colon', 'a/b', ''])(
    'rejects %s', (v) => expect(validSingleToken(v).valid).toBe(false));
});

describe('validInterfaceName (batch test interface)', () => {
  it.each(['wlan0', 'eth1', 'WLAN2'])(
    'accepts %s', (v) => expect(validInterfaceName(v).valid).toBe(true));

  it.each(['wlan 0', 'eth0.100', 'wl-an', ''])(
    'rejects %s', (v) => expect(validInterfaceName(v).valid).toBe(false));
});

describe('validWholeNumber (batch priority)', () => {
  it.each(['0', '7', '100', 0, 42])(
    'accepts %s', (v) => expect(validWholeNumber(v as any).valid).toBe(true));

  it.each(['-1', '1.5', 'seven', '', null, undefined])(
    'rejects %s', (v) => expect(validWholeNumber(v as any).valid).toBe(false));
});

describe('validIso8601Duration (job backoff, pScheduler format)', () => {
  it.each(['PT1S', 'PT30S', 'PT5M', 'PT1H30M', 'P1D', 'P1W', 'P1DT12H'])(
    'accepts %s', (v) => expect(validIso8601Duration(v).valid).toBe(true));

  it.each(['P', 'PT', '30S', '30', 'PT5', 'pt30s', '', 'P1S'])(
    'rejects %s', (v) => expect(validIso8601Duration(v).valid).toBe(false));
});

describe('validJqClause (job continue-if)', () => {
  it.each(['true', 'false', '.result == "pass"', '.[0].ok', '(.a // .b)'])(
    'accepts %s', (v) => expect(validJqClause(v).valid).toBe(true));

  it.each(['', '   ', '.a[unclosed', '(mismatch]', '((a)'])(
    'rejects %s', (v) => expect(validJqClause(v).valid).toBe(false));
});

describe('validCron (schedule repeat, 5 fields)', () => {
  it.each([
    '* * * * *',
    '0 23 * * *',      // Every day at 23:00 (the shipped default)
    '*/5 * * * *',
    '0 */4 * * *',
    '15 8 1,15 * 1-5',
  ])('accepts %s', (v) => expect(validCron(v).valid).toBe(true));

  it.each([
    ['* * * *', '4 fields'],
    ['* * * * * *', '6 fields'],
    ['60 * * * *', 'minute out of range'],
    ['* 24 * * *', 'hour out of range'],
    ['* * 0 * *', 'day 0'],
    ['* * * 13 *', 'month 13'],
    ['* * * * 8', 'weekday 8'],
    ['a * * * *', 'letters'],
    ['', 'empty'],
  ])('rejects %s (%s)', (v) => expect(validCron(v).valid).toBe(false));
});

describe('describeCron (plain-English reading of a schedule)', () => {
  it.each([
    ['* * * * *', 'every minute'],
    ['*/1 * * * *', 'every minute'],
    ['*/5 * * * *', 'every 5 minutes'],
    ['*/6 * * * *', 'every 6 minutes'],
    ['0 * * * *', 'every hour, on the hour'],
    ['30 * * * *', 'every hour at 30 minutes past'],
    ['0 */4 * * *', 'every 4 hours'],
    ['0 */6 * * *', 'every 6 hours'],
    ['15 */6 * * *', 'every 6 hours at 15 minutes past'],
    ['0 23 * * *', 'every day at 23:00'],
    ['30 9 * * *', 'every day at 09:30'],
    ['0 9 * * 1', 'every Monday at 09:00'],
    ['0 9 * * 0', 'every Sunday at 09:00'],
    ['0 9 * * 7', 'every Sunday at 09:00'],   // 0 and 7 are both Sunday
    ['0 0 1 * *', 'on day 1 of every month at 00:00'],
    ['0 0 25 12 *', 'on December 25 at 00:00'],
  ])('%s -> %s', (expr, text) => expect(describeCron(expr)).toBe(text));

  it('falls back to the raw expression for shapes it cannot phrase', () => {
    expect(describeCron('15 8 1,15 * 1-5')).toBe('15 8 1,15 * 1-5');
  });

  it('returns an invalid expression unchanged rather than guessing', () => {
    expect(describeCron('not a cron')).toBe('not a cron');
  });
});

describe('cronPeriodMinutes (frequency ranking for schedule sort order)', () => {
  it.each([
    ['* * * * *', 1],
    ['*/5 * * * *', 5],
    ['*/6 * * * *', 6],
    ['0 * * * *', 60],
    ['30 * * * *', 60],
    ['0 */4 * * *', 240],
    ['0 */6 * * *', 360],
    ['0 23 * * *', 1440],
    ['0 9 * * 1', 1440 * 7],
    ['0 0 1 * *', 1440 * 30],
    ['0 0 25 12 *', 1440 * 365],
  ])('%s -> %d minutes', (expr, minutes) => expect(cronPeriodMinutes(expr)).toBe(minutes));

  it('sorts an unordered list from most to least frequent', () => {
    const schedules = [
      { name: 'yearly', repeat: '0 0 25 12 *' },
      { name: 'every minute', repeat: '* * * * *' },
      { name: 'daily', repeat: '0 23 * * *' },
      { name: 'every 5 minutes', repeat: '*/5 * * * *' },
      { name: 'every 6 hours', repeat: '0 */6 * * *' },
      { name: 'weekly', repeat: '0 9 * * 1' },
    ];
    const sorted = [...schedules].sort(
      (a, b) => cronPeriodMinutes(a.repeat) - cronPeriodMinutes(b.repeat)
    );
    expect(sorted.map((s) => s.name)).toEqual([
      'every minute', 'every 5 minutes', 'every 6 hours', 'daily', 'weekly', 'yearly',
    ]);
  });

  it('sorts an invalid expression to the end', () => {
    expect(cronPeriodMinutes('not a cron')).toBe(Infinity);
  });
});
