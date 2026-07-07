import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  assertDaemonValid,
  applyMetadata,
  buildIniContent,
  removeIdsProperties,
  stripLegacyArchivers,
  sanitizeSsidMethods,
  stripConfigMetadata,
} from '../config.service';

/**
 * Contract tests for the generated pssid_config.json / hosts.ini.
 *
 * These pin down the shape rules the pSSID daemon actually depends on
 * (verified against the daemon source), so a change that would ship a broken
 * config to the probes fails here first.
 */

// A minimal, fully valid config object. Tests copy and break one thing at a
// time, so every case documents exactly one contract rule.
function validConfig() {
  return {
    hosts: [
      { name: 'probe-1', batches: ['batch-1'], data: {} },
    ],
    host_groups: [
      { name: 'all', hosts: ['probe-1'], batches: ['batch-1'], hosts_regex: ['.*'], data: {} },
    ],
    schedules: [
      { name: 'Every hour', repeat: '0 * * * *' },
    ],
    ssid_profiles: [
      { name: 'campus', SSID: 'Campus-WiFi', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' },
    ],
    tests: [
      { name: 'ping-test', type: 'latency', spec: { dest: 'example.com' } },
    ],
    jobs: [
      { name: 'job-1', tests: ['ping-test'], parallel: 'False', 'continue-if': 'true', backoff: 'PT1S' },
    ],
    batches: [
      {
        name: 'batch-1',
        priority: 0,
        test_interface: 'wlan0',
        ssid_profiles: ['campus'],
        jobs: ['job-1'],
        schedules: ['Every hour'],
      },
    ],
  };
}

describe('assertDaemonValid', () => {
  it('accepts a fully valid config', () => {
    expect(() => assertDaemonValid(validConfig())).not.toThrow();
  });

  it('accepts an empty config (no objects defined yet)', () => {
    expect(() =>
      assertDaemonValid({
        hosts: [], host_groups: [], schedules: [],
        ssid_profiles: [], tests: [], jobs: [], batches: [],
      })
    ).not.toThrow();
  });

  it('rejects job.parallel that is not the string "True"/"False"', () => {
    const cfg = validConfig();
    (cfg.jobs[0] as any).parallel = true; // boolean crashes the daemon's string compare
    expect(() => assertDaemonValid(cfg)).toThrow(/job "job-1".*parallel/);

    const cfg2 = validConfig();
    (cfg2.jobs[0] as any).parallel = 'true'; // wrong case
    expect(() => assertDaemonValid(cfg2)).toThrow(/parallel/);
  });

  it('rejects a non-string continue-if (daemon calls .lower() on it)', () => {
    const cfg = validConfig();
    (cfg.jobs[0] as any)['continue-if'] = true;
    expect(() => assertDaemonValid(cfg)).toThrow(/continue-if/);

    const cfg2 = validConfig();
    delete (cfg2.jobs[0] as any)['continue-if'];
    expect(() => assertDaemonValid(cfg2)).toThrow(/continue-if/);
  });

  it('rejects an SSID profile without a layer 2 or layer 3 method', () => {
    const cfg = validConfig();
    (cfg.ssid_profiles[0] as any).layer2_script = '';
    expect(() => assertDaemonValid(cfg)).toThrow(/layer2_script/);

    const cfg2 = validConfig();
    delete (cfg2.ssid_profiles[0] as any).layer3_script;
    expect(() => assertDaemonValid(cfg2)).toThrow(/layer3_script/);
  });

  it('rejects a batch with an empty ssid_profiles list', () => {
    const cfg = validConfig();
    (cfg.batches[0] as any).ssid_profiles = [];
    expect(() => assertDaemonValid(cfg)).toThrow(/ssid_profiles must be a non-empty list/);
  });

  it('rejects dangling references from batches', () => {
    const ssid = validConfig();
    (ssid.batches[0] as any).ssid_profiles = ['nope'];
    expect(() => assertDaemonValid(ssid)).toThrow(/unknown ssid_profile "nope"/);

    const job = validConfig();
    (job.batches[0] as any).jobs = ['nope'];
    expect(() => assertDaemonValid(job)).toThrow(/unknown job "nope"/);

    const sched = validConfig();
    (sched.batches[0] as any).schedules = ['nope'];
    expect(() => assertDaemonValid(sched)).toThrow(/unknown schedule "nope"/);
  });

  it('rejects dangling references from hosts and host groups', () => {
    const host = validConfig();
    (host.hosts[0] as any).batches = ['nope'];
    expect(() => assertDaemonValid(host)).toThrow(/host "probe-1".*unknown batch "nope"/);

    const groupBatch = validConfig();
    (groupBatch.host_groups[0] as any).batches = ['nope'];
    expect(() => assertDaemonValid(groupBatch)).toThrow(/host_group "all".*unknown batch/);

    const groupHost = validConfig();
    (groupHost.host_groups[0] as any).hosts = ['ghost'];
    expect(() => assertDaemonValid(groupHost)).toThrow(/unknown host "ghost"/);
  });

  it('rejects host and group names that could inject Ansible inventory syntax', () => {
    // A newline in a host name would let the name smuggle an extra inventory
    // line (e.g. a [section] header or a variable assignment) into hosts.ini.
    const host = validConfig();
    (host.hosts[0] as any).name = "probe-1\n[all:vars]\nansible_user=root";
    expect(() => assertDaemonValid(host)).toThrow(/not inventory-safe/);

    const group = validConfig();
    (group.host_groups[0] as any).name = 'bad[group]';
    expect(() => assertDaemonValid(group)).toThrow(/not inventory-safe/);
  });

  it('reports every problem in one error, not just the first', () => {
    const cfg = validConfig();
    (cfg.jobs[0] as any).parallel = 'yes';
    (cfg.ssid_profiles[0] as any).layer2_script = '';
    (cfg.batches[0] as any).jobs = ['nope'];
    try {
      assertDaemonValid(cfg);
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.message).toMatch(/parallel/);
      expect(e.message).toMatch(/layer2_script/);
      expect(e.message).toMatch(/unknown job/);
    }
  });
});

describe('applyMetadata', () => {
  it('layers group metadata under host metadata (host wins)', () => {
    const hosts = { hosts: [{ name: 'p1', data: { iface: 'wlan1', site: 'lab' } }] };
    const groups = {
      host_groups: [{ name: 'g', hosts: ['p1'], data: { iface: 'wlan0', rack: 'A' } }],
    };
    applyMetadata(hosts, groups);
    expect((hosts.hosts[0] as any).metadata).toEqual({
      iface: 'wlan1', // host overrides group
      site: 'lab',
      rack: 'A',      // inherited from group
    });
  });

  it('gives a host with no groups its own data only', () => {
    const hosts = { hosts: [{ name: 'solo', data: { a: 1 } }] };
    applyMetadata(hosts, { host_groups: [] });
    expect((hosts.hosts[0] as any).metadata).toEqual({ a: 1 });
  });

  it('merges metadata from multiple groups', () => {
    const hosts = { hosts: [{ name: 'p1', data: {} }] };
    const groups = {
      host_groups: [
        { name: 'g1', hosts: ['p1'], data: { a: 1 } },
        { name: 'g2', hosts: ['p1'], data: { b: 2 } },
      ],
    };
    applyMetadata(hosts, groups);
    expect((hosts.hosts[0] as any).metadata).toEqual({ a: 1, b: 2 });
  });

  it('treats non-object data (null, arrays) as empty', () => {
    const hosts = { hosts: [{ name: 'p1', data: null }] };
    const groups = { host_groups: [{ name: 'g', hosts: ['p1'], data: [1, 2] }] };
    applyMetadata(hosts, groups);
    expect((hosts.hosts[0] as any).metadata).toEqual({});
  });
});

describe('buildIniContent', () => {
  it('lists all hosts first, then one section per group', () => {
    const ini = buildIniContent({
      hosts: [{ name: 'p1' }, { name: 'p2' }],
      host_groups: [
        { name: 'lab', hosts: ['p1'], hosts_regex: [] },
        { name: 'all', hosts: ['p1', 'p2'], hosts_regex: ['.*'] },
      ],
    });
    const lines = ini.split('\n');
    expect(lines[0]).toBe('p1');
    expect(lines[1]).toBe('p2');
    expect(ini).toContain('[lab]\np1\n');
    expect(ini).toContain('[all]\n');
    expect(ini).toContain('#Regex [all] [.*]');
  });
});

describe('removeIdsProperties', () => {
  it('strips *_ids keys at every nesting level and keeps everything else', () => {
    const obj = {
      batch_ids: [1],
      name: 'keep',
      nested: { job_ids: [2], deep: { test_ids: [3], ok: true } },
    };
    expect(removeIdsProperties(obj)).toEqual({
      name: 'keep',
      nested: { deep: { ok: true } },
    });
  });
});

describe('stripLegacyArchivers', () => {
  it('removes legacy archiver fields left over from databases written before the feature was removed', () => {
    const data = {
      batches: [
        { name: 'a' },
        { name: 'b', archivers: ['rabbitmq-archive'], archiver_ids: ['x'] },
      ],
    };
    stripLegacyArchivers(data);
    expect(data.batches[0]).toEqual({ name: 'a' });
    expect(data.batches[1]).toEqual({ name: 'b' });
  });

  it('tolerates missing batches', () => {
    expect(() => stripLegacyArchivers({})).not.toThrow();
  });
});

describe('sanitizeSsidMethods', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pssid-l2l3-'));
  const layer2 = path.join(tmp, 'layer2');
  const layer3 = path.join(tmp, 'layer3');
  fs.mkdirSync(layer2); fs.mkdirSync(layer3);
  fs.writeFileSync(path.join(layer2, 'wpa_supplicant.json'), '{}');
  fs.writeFileSync(path.join(layer3, 'dhcp_client.json'), '{}');

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('keeps methods that match a script on disk', () => {
    const data = { ssid_profiles: [{ name: 's', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp_client' }] };
    sanitizeSsidMethods(data, { layer2_path: layer2, layer3_path: layer3 });
    expect(data.ssid_profiles[0].layer2_script).toBe('wpa_supplicant');
    expect(data.ssid_profiles[0].layer3_script).toBe('dhcp_client');
  });

  it('drops methods that do not exist on disk (stale or injected values)', () => {
    const data = { ssid_profiles: [{ name: 's', layer2_script: 'deleted_script', layer3_script: 'dhcp_client' }] };
    sanitizeSsidMethods(data, { layer2_path: layer2, layer3_path: layer3 });
    expect(data.ssid_profiles[0].layer2_script).toBe('');
    expect(data.ssid_profiles[0].layer3_script).toBe('dhcp_client');
  });

  it('falls back to a strict character check when the directory is unreadable', () => {
    const missing = { layer2_path: path.join(tmp, 'nope2'), layer3_path: path.join(tmp, 'nope3') };

    const clean = { ssid_profiles: [{ name: 's', layer2_script: 'wpa_supplicant', layer3_script: 'dhcp.v4' }] };
    sanitizeSsidMethods(clean, missing);
    expect(clean.ssid_profiles[0].layer2_script).toBe('wpa_supplicant');
    expect(clean.ssid_profiles[0].layer3_script).toBe('dhcp.v4');

    const dirty = { ssid_profiles: [{ name: 's', layer2_script: '../etc/passwd', layer3_script: 'a; rm -rf /' }] };
    sanitizeSsidMethods(dirty, missing);
    expect(dirty.ssid_profiles[0].layer2_script).toBe('');
    expect(dirty.ssid_profiles[0].layer3_script).toBe('');
  });

  it('leaves an empty selection alone', () => {
    const data = { ssid_profiles: [{ name: 's', layer2_script: '', layer3_script: '' }] };
    sanitizeSsidMethods(data, { layer2_path: layer2, layer3_path: layer3 });
    expect(data.ssid_profiles[0].layer2_script).toBe('');
  });
});

describe('stripConfigMetadata', () => {
  it('removes the volatile pssid_metadata block for diffing', () => {
    const a = JSON.stringify({ pssid_metadata: { generated_at: '2026-01-01' }, hosts: [] });
    const b = JSON.stringify({ pssid_metadata: { generated_at: '2026-07-06' }, hosts: [] });
    expect(stripConfigMetadata(a)).toBe(stripConfigMetadata(b));
  });

  it('returns raw input when it is not JSON, and empty string for null', () => {
    expect(stripConfigMetadata('not json')).toBe('not json');
    expect(stripConfigMetadata(null)).toBe('');
  });
});
