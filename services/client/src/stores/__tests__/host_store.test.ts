import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useHostStore } from '../host_store';

const fetchMock = vi.fn();

// Minimal Response-like stubs. json() and text() cover both the success path
// (json) and the error path (errorMessage reads text()).
const ok = (body: any): Response =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);
const fail = (status: number, body: any = {}): Response =>
  ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  // toast.show() schedules a 4.5s auto-dismiss; fake timers keep it from leaking.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('host store', () => {
  describe('getHosts', () => {
    it('loads hosts and returns true on success', async () => {
      fetchMock.mockResolvedValueOnce(ok([{ name: 'probe-01' }]));
      const store = useHostStore();
      const result = await store.getHosts();
      expect(result).toBe(true);
      expect(store.hosts).toEqual([{ name: 'probe-01' }]);
      expect(fetchMock).toHaveBeenCalledWith('/api/hosts', expect.any(Object));
      expect(store.isLoading).toBe(false);
    });

    it('returns false and leaves hosts untouched on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(fail(500, { message: 'boom' }));
      const store = useHostStore();
      expect(await store.getHosts()).toBe(false);
      expect(store.hosts).toEqual([]);
    });

    it('returns false and flags isError when fetch rejects', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      const store = useHostStore();
      expect(await store.getHosts()).toBe(false);
      expect(store.isError).toBe(true);
    });
  });

  describe('addHost', () => {
    it('POSTs to create-host, appends the host, returns true', async () => {
      fetchMock.mockResolvedValueOnce(ok({}));
      const store = useHostStore();
      const host = { name: 'probe-02', batches: [], data: {} };
      expect(await store.addHost(host)).toBe(true);
      expect(store.hosts).toContainEqual(host);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/hosts/create-host');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual(host);
    });

    it('does not append and returns false on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(fail(400, { message: 'Host already exists!' }));
      const store = useHostStore();
      expect(await store.addHost({ name: 'dup' })).toBe(false);
      expect(store.hosts).toEqual([]);
    });
  });

  describe('editHost', () => {
    it('PUTs to update-host and returns true', async () => {
      fetchMock.mockResolvedValueOnce(ok({}));
      const store = useHostStore();
      expect(await store.editHost({ old_hostname: 'a', new_hostname: 'b' })).toBe(true);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/hosts/update-host');
      expect(opts.method).toBe('PUT');
    });

    it('returns false on failure', async () => {
      fetchMock.mockResolvedValueOnce(fail(400));
      const store = useHostStore();
      expect(await store.editHost({ new_hostname: 'b' })).toBe(false);
    });
  });

  describe('deleteHost', () => {
    it('DELETEs the URL-encoded host name and returns true', async () => {
      fetchMock.mockResolvedValueOnce(ok({}));
      const store = useHostStore();
      expect(await store.deleteHost({ name: 'probe 01/x' })).toBe(true);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/hosts/' + encodeURIComponent('probe 01/x'));
      expect(opts.method).toBe('DELETE');
    });

    it('returns false on failure', async () => {
      fetchMock.mockResolvedValueOnce(fail(500));
      const store = useHostStore();
      expect(await store.deleteHost({ name: 'x' })).toBe(false);
    });
  });

  describe('getHostConfig', () => {
    it('stores the probe config on success', async () => {
      fetchMock.mockResolvedValueOnce(ok({ host: 'probe-01', batches: [] }));
      const store = useHostStore();
      await store.getHostConfig('probe-01');
      expect(store.probeConfig).toEqual({ host: 'probe-01', batches: [] });
      expect(store.probeConfigError).toBe('');
      expect(store.probeConfigLoading).toBe(false);
    });

    it('reads `error` (not `message`) on an authorization failure', async () => {
      fetchMock.mockResolvedValueOnce(fail(403, { error: 'Write access denied' }));
      const store = useHostStore();
      await store.getHostConfig('probe-01');
      expect(store.probeConfig).toBeNull();
      expect(store.probeConfigError).toBe('Write access denied');
    });
  });
});
