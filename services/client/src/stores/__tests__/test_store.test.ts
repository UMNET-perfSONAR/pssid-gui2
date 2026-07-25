import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTestStore } from '../test_store';

const fetchMock = vi.fn();
const ok = (body: any): Response =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);
const fail = (status: number, body: any = {}): Response =>
  ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('test store', () => {
  describe('formatPostData', () => {
    it('concatenates the form fields and the optional data, in order', () => {
      const store = useTestStore();
      const form = [{ name: 'dest', value: 'www.example.com' }];
      const optional = [{ key: 'note', value: 'v' }];
      expect(store.formatPostData(form, optional)).toEqual([
        { name: 'dest', value: 'www.example.com' },
        { key: 'note', value: 'v' },
      ]);
    });

    it('handles empty optional data', () => {
      const store = useTestStore();
      expect(store.formatPostData([{ name: 'a' }], [])).toEqual([{ name: 'a' }]);
    });

    it('does not mutate its inputs', () => {
      const store = useTestStore();
      const form = [{ name: 'a' }];
      const optional = [{ key: 'k' }];
      store.formatPostData(form, optional);
      expect(form).toEqual([{ name: 'a' }]);
      expect(optional).toEqual([{ key: 'k' }]);
    });
  });

  describe('getTests', () => {
    it('loads tests and returns true on success', async () => {
      fetchMock.mockResolvedValueOnce(ok([{ name: 't1' }]));
      const store = useTestStore();
      expect(await store.getTests()).toBe(true);
      expect(store.tests).toEqual([{ name: 't1' }]);
    });

    it('returns false on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(fail(500, { message: 'boom' }));
      const store = useTestStore();
      expect(await store.getTests()).toBe(false);
    });
  });

  describe('addTest', () => {
    it('POSTs to create-test, appends the test, returns true', async () => {
      fetchMock.mockResolvedValueOnce(ok({}));
      const store = useTestStore();
      const test = { name: 't1', type: 'rtt', spec: [] };
      expect(await store.addTest(test)).toBe(true);
      expect(store.tests).toContainEqual(test);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/tests/create-test');
      expect(opts.method).toBe('POST');
    });

    it('does not append and returns false on failure', async () => {
      fetchMock.mockResolvedValueOnce(fail(400, { message: 'bad' }));
      const store = useTestStore();
      expect(await store.addTest({ name: 't' })).toBe(false);
      expect(store.tests).toEqual([]);
    });
  });

  describe('deleteTest', () => {
    it('DELETEs the URL-encoded test name', async () => {
      fetchMock.mockResolvedValueOnce(ok({}));
      const store = useTestStore();
      expect(await store.deleteTest({ name: 'a/b' })).toBe(true);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/tests/' + encodeURIComponent('a/b'));
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    });
  });
});
