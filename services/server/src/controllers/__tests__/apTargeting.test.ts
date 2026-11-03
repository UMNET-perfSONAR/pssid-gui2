import { describe, it, expect } from 'vitest';
import { parseTargeting, splitBssids, MAX_LISTED_BSSIDS } from '../../shared/apTargeting';

// shared/apTargeting.ts: the access-point targeting rules shared by the API,
// assertDaemonValid and the SSID profile form. They mirror pssid-daemon's
// Targeting (pssid_daemon/config.py).

describe('parseTargeting', () => {
  it('leaves every unset field out', () => {
    expect(parseTargeting({})).toEqual({ value: {}, error: null });
    expect(parseTargeting({ min_signal: '', bands: [], per_bssid: false, max_bssids: '', bssids: '', connect_timeout: '' }))
      .toEqual({ value: {}, error: null });
  });

  it('reads numbers typed as text', () => {
    expect(parseTargeting({ min_signal: '-75', connect_timeout: '45' }).value).toEqual({ min_signal: -75, connect_timeout: 45 });
  });

  it('keeps bands in a fixed order, without duplicates', () => {
    expect(parseTargeting({ bands: ['6', '2.4', '6'] }).value).toEqual({ bands: ['2.4', '6'] });
  });

  it('normalizes BSSIDs and keeps $metadata references', () => {
    const { value } = parseTargeting({ bssids: 'AA-BB-CC-DD-EE-FF\n$nearest_ap, aa:bb:cc:dd:ee:ff' });
    expect(value.bssids).toEqual(['aa:bb:cc:dd:ee:ff', '$nearest_ap']);
  });

  it('keeps max_bssids only with per_bssid', () => {
    expect(parseTargeting({ per_bssid: true, max_bssids: 2 }).value).toEqual({ per_bssid: true, max_bssids: 2 });
    expect(parseTargeting({ per_bssid: false, max_bssids: 2 }).value).toEqual({});
  });

  it.each([
    [{ min_signal: 1 }, /-120 to 0/],
    [{ min_signal: -75.5 }, /whole number/],
    [{ bands: '5' }, /Bands/],
    [{ bands: ['5', '60'] }, /Bands/],
    [{ per_bssid: 'yes' }, /on or off/],
    [{ per_bssid: true, max_bssids: 33 }, /1 to 32/],
    [{ bssids: ['00:11:22:33:44'] }, /not a BSSID/],
    [{ bssids: ['$has-hyphen'] }, /not a BSSID/],
    [{ per_bssid: true, bssids: ['00:11:22:33:44:55'] }, /not both/],
    [{ connect_timeout: 301 }, /1 to 300/],
  ])('rejects %j', (input, message) => {
    const { value, error } = parseTargeting(input as Record<string, unknown>);
    expect(error).toMatch(message);
    expect(value).toEqual({});
  });

  it('limits a listed set of access points', () => {
    const many = Array.from({ length: MAX_LISTED_BSSIDS + 1 }, (_, i) => `00:11:22:33:44:${i.toString(16).padStart(2, '0')}`);
    expect(parseTargeting({ bssids: many }).error).toMatch(/at most 32/);
  });
});

describe('splitBssids', () => {
  it('splits on commas, spaces and new lines', () => {
    expect(splitBssids(' a,b\n c  d ,\n')).toEqual(['a', 'b', 'c', 'd']);
  });
});
