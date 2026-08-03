import { describe, it, expect } from 'vitest';
import TestsView from '../tests.vue';

/**
 * applySelection reconciles a SAVED test spec against the CURRENT template for
 * its type. Templates change (rtt dropped `protocol`, dns gained `query`), and
 * a saved spec is only reconciled when the test is opened in the editor, so
 * these are the cases that decide whether an existing test can be saved back as
 * a spec the daemon accepts.
 *
 * The methods are exercised directly against a stub context: the view holds no
 * state of its own here beyond what applySelection writes, and mounting would
 * pull in the whole page for no added coverage.
 */
const methods: any = (TestsView as any).methods;

function contextFor(test_options: any[]): any {
  return {
    testStore: {
      test_options,
      // The real action fetches the template; the stub context is handed the
      // already-loaded one.
      getDesiredTest: async () => {},
    },
    reconcileField: methods.reconcileField,
    viewType: null,
    origType: null,
    selectedName: null,
    currentItem: {},
    currOptionalData: [],
  };
}

const rttTemplate = [
  { name: 'dest', type: 'text', default: '', validator: 'return true;', description: 'd' },
  { name: 'length', type: 'number', default: 512, validator: 'return true;', description: 'l' },
];

const dnsTemplate = [
  { name: 'nameserver', type: 'text', default: '', validator: 'return true;', description: 'n' },
  {
    name: 'record',
    type: 'singleselect',
    options: [{ name: 'a' }, { name: 'aaaa' }],
    default: { name: 'a' },
    validator: 'return true;',
    description: 'r',
  },
  { name: 'query', type: 'text', default: '', validator: 'return true;', description: 'q' },
];

describe('tests view: applySelection', () => {
  it('drops a saved field the template no longer declares', async () => {
    const ctx = contextFor(rttTemplate);
    await methods.applySelection.call(ctx, {
      name: 'test-rtt-to-google',
      type: 'rtt',
      spec: [
        { type: 'text', name: 'dest', value: 'www.google.com' },
        { type: 'number', name: 'length', value: 512 },
        { type: 'singleselect', name: 'protocol', selected: { name: 'TCP' } },
      ],
    });

    expect(ctx.currentItem.spec.map((f: any) => f.name)).toEqual(['dest', 'length']);
    expect(ctx.currentItem.spec[0].value).toBe('www.google.com');
    expect(ctx.currentItem.spec[1].value).toBe(512);
    // The retired field must not reappear as a key-less optional entry, which
    // is what the old positional slice produced.
    expect(ctx.currOptionalData).toEqual([]);
  });

  it('adds a template field the saved test predates, with the template default', async () => {
    const ctx = contextFor(dnsTemplate);
    await methods.applySelection.call(ctx, {
      name: 'dns-test',
      type: 'dns',
      spec: [
        { type: 'text', name: 'nameserver', value: 'ns.example.edu' },
        { type: 'singleselect', name: 'record', selected: { name: 'aaaa' } },
      ],
    });

    expect(ctx.currentItem.spec.map((f: any) => f.name)).toEqual(['nameserver', 'record', 'query']);
    expect(ctx.currentItem.spec[1].selected).toEqual({ name: 'aaaa' });
    expect(ctx.currentItem.spec[2].value).toBe('');
  });

  it('keeps user-defined optional data whatever the template does', async () => {
    const ctx = contextFor(dnsTemplate);
    await methods.applySelection.call(ctx, {
      name: 'dns-test',
      type: 'dns',
      spec: [
        { type: 'text', name: 'nameserver', value: 'ns.example.edu' },
        { type: 'singleselect', name: 'record', selected: { name: 'a' } },
        { type: 'text', name: 'query', value: 'www.example.edu' },
        { key: 'comment', value: 'kept' },
      ],
    });

    expect(ctx.currOptionalData).toEqual([{ key: 'comment', value: 'kept' }]);
    expect(ctx.currentItem.spec).toHaveLength(3);
  });

  it('fills a seeded singleselect with the template options so the dropdown works', async () => {
    // A test written straight into the database by a seed script stores only
    // the chosen value, not the list to choose from.
    const ctx = contextFor(dnsTemplate);
    await methods.applySelection.call(ctx, {
      name: 'dns-test',
      type: 'dns',
      spec: [{ type: 'singleselect', name: 'record', selected: { name: 'aaaa' } }],
    });

    const record = ctx.currentItem.spec.find((f: any) => f.name === 'record');
    expect(record.options).toEqual([{ name: 'a' }, { name: 'aaaa' }]);
    expect(record.selected).toEqual({ name: 'aaaa' });
  });

  it('unwraps a legacy array-wrapped singleselect value', async () => {
    const ctx = contextFor(dnsTemplate);
    await methods.applySelection.call(ctx, {
      name: 'dns-test',
      type: 'dns',
      spec: [{ type: 'singleselect', name: 'record', selected: [{ name: 'aaaa' }] }],
    });

    expect(ctx.currentItem.spec[1].selected).toEqual({ name: 'aaaa' });
  });

  it('leaves the saved fields alone when the template could not be loaded', async () => {
    const ctx = contextFor([]);
    const spec = [{ type: 'text', name: 'dest', value: 'www.google.com' }];
    await methods.applySelection.call(ctx, { name: 't', type: 'rtt', spec });

    expect(ctx.currentItem.spec).toEqual(spec);
  });
});
