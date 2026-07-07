import { describe, it, expect } from 'vitest';
import {
  isValidObjectName,
  isValidRfc1123Name,
  isValidHostEntry,
  isValidInterfaceName,
  isWholeNumber,
  isValidIso8601Duration,
  isValidJqExpression,
  isValidSsidName,
  isNameArray,
  isPlainObjectOrAbsent,
  isValidCron,
} from '../helpers';

// These are the API-level floor rules. The client forms enforce the same or
// stricter rules; what matters here is that direct API calls cannot store
// values the forms would never produce.

describe('isValidObjectName', () => {
  it.each(['Every day at 23:00', 'edge-batch', 'run_v2.1'])('accepts %s', (v) => {
    expect(isValidObjectName(v)).toBe(true);
  });
  it.each(['', ' leading space', 'new\nline', 'bad[section]', 'a=b', 'x'.repeat(130)])(
    'rejects %j', (v) => expect(isValidObjectName(v)).toBe(false));
  it('rejects non-strings', () => {
    expect(isValidObjectName({ $ne: null })).toBe(false);
    expect(isValidObjectName(42)).toBe(false);
  });
});

describe('isValidRfc1123Name (groups, SSID profile names)', () => {
  it.each(['probe-01', 'a.b.c', 'campus-wifi'])('accepts %s', (v) => {
    expect(isValidRfc1123Name(v)).toBe(true);
  });
  it.each(['', '-lead', 'trail-.x', 'under_score', 'two..dots', 'a'.repeat(254)])(
    'rejects %j', (v) => expect(isValidRfc1123Name(v)).toBe(false));
});

describe('isValidHostEntry (host names or IP addresses)', () => {
  it.each(['probe-library-01', 'probe.example.edu', '10.0.0.5', '2001:db8::1'])(
    'accepts %s', (v) => expect(isValidHostEntry(v)).toBe(true));
  it.each(['999.1.1.1', '1.2.3', 'not:an:address', 'host name', 'a\nb'])(
    'rejects %j', (v) => expect(isValidHostEntry(v)).toBe(false));
});

describe('isValidInterfaceName (strictly alphanumeric)', () => {
  it.each(['wlan0', 'eth1', 'WLAN0'])('accepts %s', (v) => {
    expect(isValidInterfaceName(v)).toBe(true);
  });
  it.each(['', 'eth0.100', 'wl an0', 'eth-0', 'x'.repeat(65)])(
    'rejects %j', (v) => expect(isValidInterfaceName(v)).toBe(false));
});

describe('isWholeNumber (batch priority)', () => {
  it.each([0, 7, '0', '42'])('accepts %j', (v) => {
    expect(isWholeNumber(v)).toBe(true);
  });
  it.each([-1, 1.5, '', 'abc', '1e3', '-3', null, undefined])(
    'rejects %j', (v) => expect(isWholeNumber(v)).toBe(false));
});

describe('isValidIso8601Duration (pScheduler backoff)', () => {
  it.each(['PT30S', 'PT1H30M', 'P1D', 'PT5M'])('accepts %s', (v) => {
    expect(isValidIso8601Duration(v)).toBe(true);
  });
  it.each(['', '30s', 'PT', 'P', '5 minutes', 30])(
    'rejects %j', (v) => expect(isValidIso8601Duration(v)).toBe(false));
});

describe('isValidJqExpression (continue-if)', () => {
  it.each(['true', '.result.succeeded == true', '(.a // false)'])('accepts %s', (v) => {
    expect(isValidJqExpression(v)).toBe(true);
  });
  it.each(['', '(', 'a]', '{"x": [}', 'line\nbreak', 'x'.repeat(600)])(
    'rejects %j', (v) => expect(isValidJqExpression(v)).toBe(false));
});

describe('isValidSsidName (802.11 network name)', () => {
  it.each(['eduroam', 'Campus WiFi', 'x'.repeat(32)])('accepts %s', (v) => {
    expect(isValidSsidName(v)).toBe(true);
  });
  it('rejects empty, oversized, padded, and control-character values', () => {
    expect(isValidSsidName('')).toBe(false);
    expect(isValidSsidName('x'.repeat(33))).toBe(false);
    expect(isValidSsidName('é'.repeat(17))).toBe(false); // 34 UTF-8 bytes
    expect(isValidSsidName(' padded ')).toBe(false);
    expect(isValidSsidName('bad' + String.fromCharCode(7) + 'ssid')).toBe(false);
    expect(isValidSsidName(undefined)).toBe(false);
  });
});

describe('isNameArray / isPlainObjectOrAbsent (payload shapes)', () => {
  it('accepts arrays of valid names and plain objects', () => {
    expect(isNameArray([])).toBe(true);
    expect(isNameArray(['edge-batch', 'core-batch'])).toBe(true);
    expect(isPlainObjectOrAbsent(undefined)).toBe(true);
    expect(isPlainObjectOrAbsent({ site: 'library' })).toBe(true);
  });
  it('rejects operator objects, non-arrays and arrays of non-names', () => {
    expect(isNameArray('edge-batch')).toBe(false);
    expect(isNameArray([{ $ne: null }])).toBe(false);
    expect(isNameArray(['ok', 'bad\nname'])).toBe(false);
    expect(isPlainObjectOrAbsent([1, 2])).toBe(false);
    expect(isPlainObjectOrAbsent('text')).toBe(false);
  });
});

describe('isValidCron (schedule repeat)', () => {
  it.each(['0 23 * * *', '*/5 * * * *', '15 8 1,15 * 1-5'])('accepts %s', (v) => {
    expect(isValidCron(v)).toBe(true);
  });
  it.each(['', '60 * * * *', '* * * *', '* * * * * *', 'a b c d e'])(
    'rejects %j', (v) => expect(isValidCron(v)).toBe(false));
});
