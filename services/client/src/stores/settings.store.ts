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
    autoProvision: false,
    isLoading: false,
    isSaving: false,
    preview: null as ConfigPreview | null,
    previewLoading: false,
    provisionLoading: false,
  }),

  actions: {
    async getSettings() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/settings', authOptions());
        if (!res.ok) {
          throw new Error(await responseMessage(res, 'Failed to load settings'));
        }
        const data = await res.json();
        this.autoProvision = !!data.autoProvision;
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

    async setAutoProvision(value: boolean) {
      const previous = this.autoProvision;
      try {
        this.isSaving = true;
        this.autoProvision = value; // optimistic
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoProvision: value }),
          ...authOptions(),
        });
        if (!res.ok) {
          this.autoProvision = previous; // revert
          throw new Error(await responseMessage(res, 'Failed to update settings'));
        }
        const data = await res.json();
        this.autoProvision = !!data.autoProvision;
        useToastStore().show(
          value ? 'Auto-provision enabled' : 'Auto-provision disabled',
          'success'
        );
      } catch (err) {
        this.autoProvision = previous;
        console.error(err);
        useToastStore().show(
          err instanceof Error ? err.message : 'Failed to update settings',
          'error'
        );
      } finally {
        this.isSaving = false;
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

    async provisionNow() {
      if (this.provisionLoading) return;

      try {
        this.provisionLoading = true;
        const res = await fetch('/api/hosts/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([]), // empty body => provision all ('*')
          ...authOptions(),
        });
        if (res.ok) {
          useToastStore().show('Provisioning started', 'success');
        } else {
          throw new Error(await responseMessage(res, 'Failed to start provisioning'));
        }
      } catch (err) {
        console.error(err);
        useToastStore().show(
          err instanceof Error ? err.message : 'Failed to start provisioning',
          'error'
        );
      } finally {
        this.provisionLoading = false;
      }
    }
  }
})
