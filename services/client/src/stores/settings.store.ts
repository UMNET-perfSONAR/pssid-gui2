import { defineStore } from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    autoProvision: false,
    isLoading: false,
    isSaving: false,
  }),

  actions: {
    async getSettings() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/settings', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.autoProvision = !!data.autoProvision;
      } catch (err) {
        console.error(err);
        useToastStore().show('Failed to load settings', 'error');
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
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          this.autoProvision = previous; // revert
          const text = await res.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update settings', 'error');
          return;
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
        useToastStore().show('Failed to update settings', 'error');
      } finally {
        this.isSaving = false;
      }
    },

    /** Manually provision all probes now (reuses the hosts /config endpoint). */
    async provisionNow() {
      try {
        const res = await fetch('/api/hosts/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([]), // empty body => provision all ('*')
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (res.ok) {
          useToastStore().show('Provisioning started — check History for the result', 'success');
        } else {
          useToastStore().show('Failed to start provisioning', 'error');
        }
      } catch (err) {
        console.error(err);
        useToastStore().show('Failed to start provisioning', 'error');
      }
    }
  }
})
