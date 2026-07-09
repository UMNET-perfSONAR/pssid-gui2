import { defineStore } from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

interface ConfigPreview {
  proposed: { config: string; inventory: string };
  current: { config: string | null; inventory: string | null };
  changed: boolean;
}

function authOptions(): RequestInit {
  return config.ENABLE_SSO ? { credentials: 'include' } : {};
}

async function responseMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  if (!text) return fallback;

  try {
    const data = JSON.parse(text);
    return typeof data?.message === 'string' ? data.message : fallback;
  } catch {
    return text;
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    isLoading: false,
    preview: null as ConfigPreview | null,
    previewLoading: false,
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
        const res = await fetch('/api/provision/preview', authOptions());
        if (!res.ok) {
          throw new Error(await responseMessage(res, 'Failed to build preview'));
        }
        this.preview = await res.json();
      } catch (err) {
        console.error(err);
        useToastStore().show(
          err instanceof Error ? err.message : 'Failed to build preview',
          'error'
        );
      } finally {
        this.previewLoading = false;
      }
    },
  }
})
