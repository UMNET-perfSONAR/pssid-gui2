import { defineStore } from 'pinia'
import config from '../shared/config'

export const useScriptsStore = defineStore('scripts', {
  state: () => ({
    scripts: [] as string[],
    isError: false
  }),
  actions: {
    async getScripts() {
      try {
        const res = await fetch('/api/scripts/files', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.scripts = await res.json();
      } catch(error) {
        console.error(error);
        this.isError = true;
      }
    }
  }
});
