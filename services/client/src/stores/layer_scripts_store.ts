import { defineStore } from 'pinia'
import config from '../shared/config'

export const useLayerScriptsStore = defineStore('layerScripts', {
  state: () => ({
    layer2_scripts: [] as string[],
    layer3_scripts: [] as string[],
    defaults: { default_layer2: '', default_layer3: '' } as Record<string, string>,
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
    },
    async getDefaults() {
      try {
        const res = await fetch('/api/layer-scripts/defaults', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.defaults = await res.json();
      } catch(error) {
        console.error(error);
        this.isError = true;
      }
    },
    // Returns the script to pre-select given the available options. A method is
    // required on every batch, so this always pre-fills a real method whenever any
    // exist — the operator can still change it when there's more than one.
    // Rule: no options → blank (nothing to pick; UI shows a warning);
    //       1 option → that option (no real choice);
    //       multiple + a configured default that exists → the configured default;
    //       multiple, no valid configured default → the first option (sensible pre-fill).
    resolveDefault(scripts: string[], defaultKey: 'default_layer2' | 'default_layer3'): string {
      if (scripts.length === 0) return '';
      if (scripts.length === 1) return scripts[0];
      const configured = this.defaults[defaultKey];
      if (configured && scripts.includes(configured)) return configured;
      return scripts[0];
    }
  }
});
