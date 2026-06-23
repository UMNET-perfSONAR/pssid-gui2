import { defineStore } from 'pinia'
import config from '../shared/config'

export const useProvisionHistoryStore = defineStore('provisionHistory', {
  state: () => ({
    history: [] as any[],
    isLoading: false
  }),
  actions: {
    async getHistory() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/provision-history', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.history = Array.isArray(data) ? data : [];
      } catch (err) {
        console.error(err);
      } finally {
        this.isLoading = false;
      }
    }
  }
})
