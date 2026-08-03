import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatTestSpec } from '../config.service';

/**
 * Contract tests for the starter test templates (services/server/starters/tests).
 *
 * A template's parameters become, one for one, the `spec` object the daemon
 * hands to pScheduler. pScheduler rejects a spec with a field it does not
 * define, so a wrong template ships tests that cannot run on a probe and the
 * GUI has no way to notice: it writes whatever the template declares. These
 * tests pin the fields down where a code review can see them.
 */

const templatesDir = path.join(__dirname, '../../../starters/tests');

function template(name: string) {
  return JSON.parse(fs.readFileSync(path.join(templatesDir, `${name}.json`), 'utf-8'));
}

function fieldNames(name: string): string[] {
  return template(name).parameters.map((p: any) => p.name);
}

/** The spec the daemon would receive for a test built from a template's defaults. */
function specFromDefaults(name: string) {
  const spec = template(name).parameters.map((p: any) =>
    p.type === 'singleselect'
      ? { type: p.type, name: p.name, selected: p.default }
      : { type: p.type, name: p.name, value: p.default }
  );
  return formatTestSpec(spec, name);
}

describe('starter test templates', () => {
  it('every template parses and declares a name and parameters', () => {
    const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const parsed = JSON.parse(fs.readFileSync(path.join(templatesDir, file), 'utf-8'));
      expect(parsed.name).toBe(path.parse(file).name);
      expect(Array.isArray(parsed.parameters)).toBe(true);
      for (const parameter of parsed.parameters) {
        expect(typeof parameter.name).toBe('string');
        // multiselect is rejected in test specs (see formatTestSpec), so a
        // template must never offer one.
        expect(parameter.type).not.toBe('multiselect');
      }
    }
  });

  describe('rtt', () => {
    it('declares only dest and length', () => {
      // `protocol` was offered here once. pScheduler's rtt test has no such
      // field, so every generated rtt test was rejected by the probe.
      expect(fieldNames('rtt')).toEqual(['dest', 'length']);
    });

    it('generates a spec pScheduler accepts', () => {
      expect(specFromDefaults('rtt')).toEqual({ dest: '', length: 512 });
    });
  });

  describe('dns', () => {
    it('declares nameserver, record and query', () => {
      // `query` - the name to look up - is required; without it the generated
      // test is incomplete and cannot run.
      expect(fieldNames('dns')).toEqual(['nameserver', 'record', 'query']);
    });

    it('offers record types in the lowercase form pScheduler expects', () => {
      const record = template('dns').parameters.find((p: any) => p.name === 'record');
      const options = record.options.map((o: any) => o.name);
      expect(options).toEqual(['a', 'aaaa', 'ns', 'cname', 'soa', 'ptr', 'mx', 'txt']);
      expect(record.default).toEqual({ name: 'a' });
    });

    it('generates a spec pScheduler accepts', () => {
      expect(specFromDefaults('dns')).toEqual({ nameserver: '', record: 'a', query: '' });
    });
  });
});
