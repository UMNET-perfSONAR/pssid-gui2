import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '../settings.store';

const fetchMock = vi.fn();
const ok = (body: any): Response =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);
// `raw` overrides the body text, to simulate a non-JSON error page.
const fail = (status: number, body: any = {}, raw?: string): Response =>
  ({ ok: false, status, json: async () => body, text: async () => (raw !== undefined ? raw : JSON.stringify(body)) } as unknown as Response);

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

describe('settings store', () => {
  describe('previewConfig', () => {
    it('stores the proposed preview on success', async () => {
      const preview = { proposed: { config: '{}', inventory: '' } };
      fetchMock.mockResolvedValueOnce(ok(preview));
      const store = useSettingsStore();
      await store.previewConfig();
      expect(store.preview).toEqual(preview);
      expect(store.previewError).toBe('');
      expect(store.previewLoading).toBe(false);
    });

    it('surfaces a 422 validation message inline (not just a toast)', async () => {
      fetchMock.mockResolvedValueOnce(fail(422, { message: 'batch "b": ssid_profiles must be a non-empty list' }));
      const store = useSettingsStore();
      await store.previewConfig();
      expect(store.preview).toBeNull();
      expect(store.previewError).toBe('batch "b": ssid_profiles must be a non-empty list');
    });

    it('returns the raw text when the error body is not JSON', async () => {
      fetchMock.mockResolvedValueOnce(fail(502, {}, '<html>502 Bad Gateway</html>'));
      const store = useSettingsStore();
      await store.previewConfig();
      expect(store.previewError).toBe('<html>502 Bad Gateway</html>');
    });

    it('falls back to the `error` field on an authorization failure', async () => {
      fetchMock.mockResolvedValueOnce(fail(403, { error: 'Write access denied: SSO disabled and OPEN_WRITE false' }));
      const store = useSettingsStore();
      await store.previewConfig();
      expect(store.previewError).toBe('Write access denied: SSO disabled and OPEN_WRITE false');
    });

    // The Refresh button lives ON the preview panel, so clearing the result at
    // the start of a rebuild would remove the control that was just clicked and
    // collapse the reader's scroll position in a file longer than the viewport.
    it('keeps the previous result on screen while a refresh is in flight', async () => {
      const first = { proposed: { config: '{"v":1}', inventory: 'old' } };
      const second = { proposed: { config: '{"v":2}', inventory: 'new' } };
      const store = useSettingsStore();

      fetchMock.mockResolvedValueOnce(ok(first));
      await store.previewConfig();

      let release: (res: Response) => void = () => {};
      fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
      const inFlight = store.previewConfig();
      expect(store.previewLoading).toBe(true);
      expect(store.preview).toEqual(first);

      release(ok(second));
      await inFlight;
      expect(store.preview).toEqual(second);
      expect(store.previewLoading).toBe(false);
    });

    it('drops the stale result when a refresh comes back invalid', async () => {
      const store = useSettingsStore();
      fetchMock.mockResolvedValueOnce(ok({ proposed: { config: '{}', inventory: '' } }));
      await store.previewConfig();

      fetchMock.mockResolvedValueOnce(fail(422, { message: 'batch "b": ssid_profiles must be a non-empty list' }));
      await store.previewConfig();

      // Not left underneath the error: those files are no longer on offer.
      expect(store.preview).toBeNull();
      expect(store.previewError).toBe('batch "b": ssid_profiles must be a non-empty list');
    });

    it('is a no-op while a preview is already in flight (Preview and Refresh share it)', async () => {
      const store = useSettingsStore();
      store.previewLoading = true;
      await store.previewConfig();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('generateConfig', () => {
    it('POSTs an empty-array body and marks generated on success', async () => {
      fetchMock.mockResolvedValueOnce(ok({}));
      const store = useSettingsStore();
      await store.generateConfig();
      expect(store.generated).toBe(true);
      expect(store.generateError).toBe('');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/hosts/config');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual([]);
    });

    it('shows a validation failure inline in generateError', async () => {
      fetchMock.mockResolvedValueOnce(fail(422, { message: 'invalid config' }));
      const store = useSettingsStore();
      await store.generateConfig();
      expect(store.generated).toBe(false);
      expect(store.generateError).toBe('invalid config');
    });

    it('is a no-op while a generate is already in flight (re-entrancy guard)', async () => {
      const store = useSettingsStore();
      store.generateLoading = true;
      await store.generateConfig();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
