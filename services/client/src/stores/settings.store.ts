import { defineStore } from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

interface ConfigPreview {
  proposed: { config: string; inventory: string };
}

function authOptions(): RequestInit {
  return config.ENABLE_SSO ? { credentials: 'include' } : {};
}

async function responseMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  if (!text) return fallback;

  try {
    const data = JSON.parse(text);
    if (typeof data?.message === 'string') return data.message;
    // Authorization failures answer with `error`, not `message` (see
    // authorize() in shared/accessControl.ts). Reading only `message` turned
    // the most actionable response the server sends -- "Write access denied:
    // SSO disabled and OPEN_WRITE false" -- into the caller's generic fallback,
    // leaving no way to tell a permission problem from a broken config.
    if (typeof data?.error === 'string') return data.error;
    return fallback;
  } catch {
    return text;
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    isLoading: false,
    preview: null as ConfigPreview | null,
    previewLoading: false,
    // Set when the current database state would generate an invalid config
    // (the specific daemon-validation problem), instead of a toast that
    // disappears - this is the one thing the GUI can tell you for certain.
    previewError: '',
    // Generate = write the validated config files to disk on the controller.
    generateLoading: false,
    generated: false,
    // A daemon-validation failure on generate is shown inline (same reasoning
    // as previewError): a specific, fixable problem, not a transient toast.
    generateError: '',
  }),

  actions: {
    async getSettings() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/settings', authOptions());
        if (!res.ok) {
          throw new Error(await responseMessage(res, 'Failed to load settings'));
        }
      } catch (err) {
        console.error(err);
        useToastStore().show(
          err instanceof Error ? err.message : 'Failed to load settings',
          'error'
        );
      } finally {
        this.isLoading = false;
      }
    },

    async previewConfig() {
      try {
        this.previewLoading = true;
        this.preview = null;
        this.previewError = '';
        const res = await fetch('/api/provision/preview', authOptions());
        if (!res.ok) {
          // A validation failure (422) is a real, specific answer, not an
          // error to toast and forget - show it inline so it stays visible.
          this.previewError = await responseMessage(res, 'Failed to build preview');
          return;
        }
        this.preview = await res.json();
      } catch (err) {
        console.error(err);
        this.previewError = 'Failed to build preview';
      } finally {
        this.previewLoading = false;
      }
    },

    /**
     * Generate the config files: build and validate them from the current
     * database state and WRITE them to disk on the controller
     * (pssid_config.json + hosts.ini under the server's output directory,
     * /var/lib/pssid/output on a standard deploy). This is generation only -
     * it does not deliver anything to the probes; that is a separate step a
     * real bin/provision script performs. The empty-array body tells the
     * server to build the whole config ('*'), which is what the daemon
     * consumes regardless of which host prompted it.
     */
    async generateConfig() {
      if (this.generateLoading) return;
      try {
        this.generateLoading = true;
        this.generated = false;
        this.generateError = '';
        const res = await fetch('/api/hosts/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([]),
          ...authOptions(),
        });
        if (!res.ok) {
          // 422 carries the specific daemon-validation problem; keep it visible.
          this.generateError = await responseMessage(res, 'Failed to generate config files');
          return;
        }
        this.generated = true;
      } catch (err) {
        console.error(err);
        this.generateError = 'Failed to generate config files';
      } finally {
        this.generateLoading = false;
      }
    },
  }
})
