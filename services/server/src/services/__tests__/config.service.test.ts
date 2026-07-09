import { describe, it, expect } from 'vitest';
import { formatTestSpec, formatTestData } from '../config.service';

describe('formatTestSpec', () => {
  it('maps text / number / float fields to name:value', () => {
    const spec = [
      { type: 'text', name: 'host', value: 'example.com' },
      { type: 'number', name: 'count', value: 5 },
      { type: 'float', name: 'interval', value: 0.5 },
    ];
    expect(formatTestSpec(spec)).toEqual({
      host: 'example.com',
      count: 5,
      interval: 0.5,
    });
  });

  it('maps singleselect to the selected name', () => {
    const spec = [{ type: 'singleselect', name: 'mode', selected: { name: 'fast' } }];
    expect(formatTestSpec(spec)).toEqual({ mode: 'fast' });
  });

  it('throws a named, prefixed error on a singleselect with no value selected', () => {
    const spec = [{ type: 'singleselect', name: 'protocol', selected: null }];
    expect(() => formatTestSpec(spec, 'rtt-check')).toThrow(
      'Config validation failed: test "rtt-check" field "protocol" has no value selected'
    );
  });

  it('throws the same way when selected is a malformed array instead of an object', () => {
    // The shape a stale/untouched form default used to produce (see dynamicform.vue).
    const spec = [{ type: 'singleselect', name: 'protocol', selected: [{ name: 'TCP' }] }];
    expect(() => formatTestSpec(spec, 'rtt-check')).toThrow(/Config validation failed/);
  });

  it('maps user-defined optional key/value pairs', () => {
    const spec = [{ key: 'custom', value: '42' }];
    expect(formatTestSpec(spec)).toEqual({ custom: '42' });
  });

  it('throws on multiselect (not allowed in test specs)', () => {
    const spec = [{ type: 'multiselect', name: 'bad', selected: [] }];
    expect(() => formatTestSpec(spec)).toThrow(/Config validation failed/);
  });

  it('throws on an optional entry missing key/value', () => {
    const spec = [{ foo: 'bar' }];
    expect(() => formatTestSpec(spec)).toThrow(/Config validation failed/);
  });

  it('returns an empty object for an empty spec', () => {
    expect(formatTestSpec([])).toEqual({});
  });

  it('preserves falsy-but-valid values (0 and empty string)', () => {
    const spec = [
      { type: 'number', name: 'count', value: 0 },
      { type: 'text', name: 'note', value: '' },
    ];
    expect(formatTestSpec(spec)).toEqual({ count: 0, note: '' });
  });

  it('handles a mix of required fields and optional key/value pairs', () => {
    const spec = [
      { type: 'text', name: 'host', value: 'a.com' },
      { key: 'extra', value: 'x' },
    ];
    expect(formatTestSpec(spec)).toEqual({ host: 'a.com', extra: 'x' });
  });
});

describe('formatTestData', () => {
  it('formats a list of tests into name/type/spec form', async () => {
    const input = [
      { name: 't1', type: 'ping', spec: [{ type: 'text', name: 'host', value: 'a.com' }] },
    ];
    const result = await formatTestData(input);
    expect(result).toEqual({
      tests: [{ name: 't1', type: 'ping', spec: { host: 'a.com' } }],
    });
  });
});
