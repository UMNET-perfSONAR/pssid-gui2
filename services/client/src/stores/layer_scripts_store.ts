import { defineStore } from 'pinia'
import config from '../shared/config'

export const useLayerScriptsStore = defineStore('layerScripts', {
  state: () => ({
    layer2_scripts: [] as string[],
    layer3_scripts: [] as string[],
    isError: false
  }),
  actions: {
    async getLayer2Scripts() {
      try {
        const res = await fetch('/api/layer-scripts/layer2-files', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.layer2_scripts = await res.json();
      } catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
    async getLayer3Scripts() {
      try {
        const res = await fetch('/api/layer-scripts/layer3-files', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.layer3_scripts = await res.json();
      } catch(error) {
        console.error(error);
        this.isError = true;
      }
    }
  }
});
