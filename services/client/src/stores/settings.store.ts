import { defineStore } from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

interface ConfigPreview {
  proposed: { config: string; inventory: string };
}

function authOptions(): RequestInit {
  return config.ENABLE_SSO ? { credentials: 'include' } : {};
}

/**
 * How long a busy state stays on screen at minimum, in milliseconds.
 *
 * Preview and Generate usually answer in well under 100ms on a controller
 * talking to a MongoDB on the same host, and a spinner that appears and
 * disappears inside a frame or two is not read as "it worked" -- it is not read
 * at all. The button flickers, the panel looks untouched, and the natural
 * response is to click Refresh again and wonder whether anything is wired up.
 *
 * 400ms is chosen from the two perception thresholds either side of it: below
 * ~100ms a change is perceived as instantaneous (so the spinner may as well not
 * have rendered), and around ~1s a wait starts to be felt as a delay. 400ms sits
 * clear of both -- long enough to register as a completed action, short enough
 * that nobody is waiting on it.
 *
 * This only ever ADDS time to a fast response. A request slower than this is
 * already visible on its own and is not held any further.
 */
export const MIN_BUSY_MS = 400;

/**
 * Resolve no earlier than MIN_BUSY_MS after `startedAt`.
 *
 * Awaited in the `finally` of each action, so the busy flag is lowered on the
 * success and failure paths alike -- a validation error that flashes past is
 * exactly as unreadable as a success that does.
 */
function holdBusy(startedAt: number): Promise<void> {
  const remaining = MIN_BUSY_MS - (Date.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remaining));
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

    /**
     * Build the preview. Also the Refresh button on the preview panel itself,
     * which is why the previous result is NOT cleared up front: blanking it
     * would take the panel -- and the button that was just clicked -- off the
     * screen for the length of the request, and drop the reader's scroll
     * position in a file that is usually longer than the viewport. The panel
     * stays put and shows its own busy state (settings.vue) until this returns.
     *
     * It is still cleared on both failure paths below: an error means the
     * current database state produces no config, and leaving the last good one
     * on screen underneath the message would read as though those files were
     * still on offer.
     */
    async previewConfig() {
      if (this.previewLoading) return;
      const startedAt = Date.now();
      try {
        this.previewLoading = true;
        this.previewError = '';
        const res = await fetch('/api/provision/preview', authOptions());
        if (!res.ok) {
          // A validation failure (422) is a real, specific answer, not an
          // error to toast and forget - show it inline so it stays visible.
          this.preview = null;
          this.previewError = await responseMessage(res, 'Failed to build preview');
          return;
        }
        this.preview = await res.json();
      } catch (err) {
        console.error(err);
        this.preview = null;
        this.previewError = 'Failed to build preview';
      } finally {
        // The result is already in state, so the panel below updates under the
        // scrim and is revealed complete when the flag drops -- rather than the
        // reverse, where content changes first and the spinner trails it.
        await holdBusy(startedAt);
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
      const startedAt = Date.now();
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
        await holdBusy(startedAt);
        this.generateLoading = false;
      }
    },

    /**
     * Clear the "Files written to the controller" confirmation once the
     * view has decided it's been up long enough (settings.vue). A plain
     * state reset, not folded into generateConfig(): that action already
     * clears `generated` at the START of the next run so a stale success
     * never lingers under a fresh one, so this is only ever the view's own
     * auto-dismiss timer firing on an unrelated, idle success.
     */
    dismissGenerated() {
      this.generated = false;
    },
  }
})
