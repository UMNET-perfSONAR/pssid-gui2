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
  metadataError,
  isValidCron,
  sendDeleted,
  provisionTarget,
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

describe('isValidInterfaceName (alphanumeric or $metadata reference)', () => {
  it.each(['wlan0', 'eth1', 'WLAN0', '$ifacename', '$iface_name'])('accepts %s', (v) => {
    expect(isValidInterfaceName(v)).toBe(true);
  });
  it.each(['', 'eth0.100', 'wl an0', 'eth-0', 'x'.repeat(65), '$', '$ iface', 'wlan$0', '$iface.name'])(
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

describe('sendDeleted (the response every delete handler sends)', () => {
  const fakeRes = () => {
    const calls: unknown[] = [];
    return { json: (body: unknown) => { calls.push(body); }, calls };
  };

  it('answers with a JSON object, never a bare string', () => {
    // res.send(string) makes Express label the body text/html, which is what
    // made an echoed name a reflected XSS. Anything other than a plain object
    // here means that has crept back in.
    const res = fakeRes();
    sendDeleted(res as any, 'host', 'probe-01');
    expect(res.calls).toEqual([{ message: 'host probe-01 was deleted' }]);
  });

  it('echoes a hostile name inertly, as a JSON string value', () => {
    const res = fakeRes();
    sendDeleted(res as any, 'host', '<img src=x onerror=alert(1)>');
    const body = res.calls[0] as { message: string };
    expect(body.message).toBe('host <img src=x onerror=alert(1)> was deleted');
    // The point is the container, not the content: JSON.stringify escapes this
    // into a string literal that no browser parses as markup.
    expect(JSON.stringify(body)).not.toContain('<img src=x onerror=alert(1)>"');
  });
});

// This value becomes an entry in the argument vector of the operator's
// provision script. execFile spawns no shell, so shell metacharacters were
// never the risk here -- argument injection is, and it needs no shell.
describe('provisionTarget (what may reach the provision script argv)', () => {
  it('accepts the empty array the GUI sends for "the whole config"', () => {
    expect(provisionTarget([])).toBe('*');
  });

  it('accepts an explicit * and a valid object name', () => {
    expect(provisionTarget({ name: '*' })).toBe('*');
    expect(provisionTarget({ name: 'probe-01' })).toBe('probe-01');
    expect(provisionTarget({ name: 'Every day at 23:00' })).toBe('Every day at 23:00');
  });

  it('rejects a leading dash, which a forwarded command reads as an option', () => {
    // e.g. ansible-playbook --limit "$2", rsync, or anything using getopts.
    expect(provisionTarget({ name: '-e' })).toBeNull();
    expect(provisionTarget({ name: '--extra-vars=x' })).toBeNull();
    expect(provisionTarget({ name: '-rf' })).toBeNull();
  });

  it('rejects non-strings, which throw inside execFile and surface as a 500', () => {
    expect(provisionTarget({ name: { $ne: null } })).toBeNull();
    expect(provisionTarget({ name: ['a'] })).toBeNull();
    expect(provisionTarget({ name: 42 })).toBeNull();
    expect(provisionTarget({ name: null })).toBeNull();
    expect(provisionTarget({})).toBeNull();
  });

  it('rejects a non-empty array and non-object bodies', () => {
    expect(provisionTarget(['probe-01'])).toBeNull();
    expect(provisionTarget('probe-01')).toBeNull();
    expect(provisionTarget(null)).toBeNull();
    expect(provisionTarget(undefined)).toBeNull();
  });

  it('rejects names carrying inventory or shell syntax', () => {
    expect(provisionTarget({ name: 'a\n[all]\nx=1' })).toBeNull();
    expect(provisionTarget({ name: '$(id)' })).toBeNull();
    expect(provisionTarget({ name: 'a; rm -rf /' })).toBeNull();
    expect(provisionTarget({ name: '../../etc/passwd' })).toBeNull();
  });
});

// Metadata is consumed by the daemon as a FLAT map of strings, and each key is
// resolved per host as a $reference. The old check accepted any non-array
// object, so a nested value passed the API, was stored, and was written into
// pssid_config.json where the daemon expects a scalar -- with the GUI reporting
// success the whole way.
describe('metadataError (host and group metadata)', () => {
  it('accepts absent metadata and a flat string map', () => {
    expect(metadataError(undefined)).toBeNull();
    expect(metadataError(null)).toBeNull();
    expect(metadataError({})).toBeNull();
    expect(metadataError({ external_dest: 'www.example.edu', ifacename: 'wlan0' })).toBeNull();
    // An empty value is a legitimate "defined but blank"; the form can make it.
    expect(metadataError({ external_dest: '' })).toBeNull();
  });

  it('rejects non-string values, which the daemon cannot substitute', () => {
    expect(metadataError({ a: { nested: 'x' } })).toMatch(/must be text/);
    expect(metadataError({ a: ['x'] })).toMatch(/must be text/);
    expect(metadataError({ a: 42 })).toMatch(/must be text/);
    expect(metadataError({ a: true })).toMatch(/must be text/);
    expect(metadataError({ a: null })).toMatch(/must be text/);
  });

  it('rejects keys a $reference cannot name', () => {
    // $external-dest resolves as $external followed by a literal -dest, which
    // silently produces the wrong target rather than an error.
    expect(metadataError({ 'external-dest': 'x' })).toMatch(/must be letters, numbers or underscores/);
    expect(metadataError({ 'has space': 'x' })).toMatch(/must be letters/);
    expect(metadataError({ '': 'x' })).toMatch(/must be letters/);
    expect(metadataError({ 'a.b': 'x' })).toMatch(/must be letters/);
    expect(metadataError({ ['k'.repeat(65)]: 'x' })).toMatch(/must be letters/);
  });

  it('still rejects the shapes that are not objects at all', () => {
    expect(metadataError([1, 2])).toBe('Metadata must be an object of key/value pairs');
    expect(metadataError('text')).toBe('Metadata must be an object of key/value pairs');
  });

  it('bounds key count and value length', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 101; i++) many[`k${i}`] = 'v';
    expect(metadataError(many)).toMatch(/limited to 100 keys/);
    expect(metadataError({ a: 'x'.repeat(1025) })).toMatch(/1024 characters or fewer/);
    expect(metadataError({ a: 'x'.repeat(1024) })).toBeNull();
  });
});
