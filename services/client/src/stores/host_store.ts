import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'
import { errorMessage } from '../utils/http'

export const useHostStore = defineStore('hostStore', {
  state: () => ({
    hosts: [] as any[],
    isLoading: false,
    isError: false,
    // Effective configuration of the currently selected probe (what it will
    // run, sliced from the generated pssid_config.json).
    probeConfig: null as any,
    probeConfigError: '',
    probeConfigLoading: false
  }),

  // Every mutating action resolves to true on success and false on failure,
  // so a view can keep the user's typed input when the server says no.
  actions: {

    async getHosts(): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await fetch('/api/hosts', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load hosts'), 'error');
          return false;
        }
        this.hosts = await res.json();
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load hosts', 'error');
        return false;
      }
      finally {
        this.isLoading = false;
      }
    },

    async addHost(host: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/hosts/create-host',
          {
            method: 'POST',
            body: JSON.stringify(host),
            mode: 'cors',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            headers: { "Content-Type": "application/json" }
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to add host'), 'error');
          return false;
        }
        this.hosts.push(host);
        useToastStore().show(`Host "${host.name}" added`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add host', 'error');
        return false;
      }
    },

    async deleteHost(host: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/hosts/' + encodeURIComponent(host?.name),
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to delete host'), 'error');
          return false;
        }
        useToastStore().show(`Host "${host?.name}" deleted`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete host', 'error');
        return false;
      }
    },

    async editHost(updateHostObj: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/hosts/update-host',
          {
            method: "PUT",
            mode: "cors",
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {}),
            body: JSON.stringify(updateHostObj),
            headers: { "Content-Type": "application/json" }
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to update host'), 'error');
          return false;
        }
        useToastStore().show(`Host "${updateHostObj.new_hostname}" updated`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update host', 'error');
        return false;
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/hosts', {
          method: 'DELETE',
        });
        this.hosts = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    /**
     * The effective configuration of one probe: metadata, groups, and the
     * fully expanded batches it runs, sliced from the same payload the
     * daemon receives.
     */
    async getHostConfig(name: string) {
      this.probeConfigLoading = true;
      this.probeConfigError = '';
      this.probeConfig = null;
      try {
        const res = await fetch(
          '/api/hosts/host-config/' + encodeURIComponent(name),
          { ...(config.ENABLE_SSO ? { credentials: 'include' } : {}) }
        );
        const data = await res.json();
        if (res.ok) {
          this.probeConfig = data;
        } else {
          this.probeConfigError = data.message || 'Could not build the probe configuration';
        }
      }
      catch(error) {
        console.error(error);
        this.probeConfigError = 'Could not build the probe configuration';
      }
      this.probeConfigLoading = false;
    },
  }
})
