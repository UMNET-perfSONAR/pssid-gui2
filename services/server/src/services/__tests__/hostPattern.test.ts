import { describe, expect, it } from 'vitest';
import { matchesHostPattern } from '../hostPattern';

describe('daemon-compatible host pattern anchoring', () => {
  it('anchors every alternative to the start of the hostname', () => {
    expect(matchesHostPattern('probe|sensor', 'other-sensor')).toBe(false);
    expect(matchesHostPattern('probe|sensor', 'sensor-01')).toBe(true);
    expect(matchesHostPattern('probe|sensor', 'probe-01')).toBe(true);
  });
});
