import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useHostStore = defineStore('hostStore', {
  state: () => ({
    hosts: [{}],
    isLoading: false,
    isError: false,
    // Effective configuration of the currently selected probe (what it will
    // run, sliced from the generated pssid_config.json).
    probeConfig: null as any,
    probeConfigError: '',
    probeConfigLoading: false
  }),

  actions: {

    async getHosts() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/hosts', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.hosts = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load hosts', 'error');
      }
    },

    async addHost(host:any) {
      try {
        this.isLoading = true;
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

        if (response.ok) {
          this.hosts.push(host);
          useToastStore().show(`Host "${host.name}" added`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add host', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add host', 'error');
      }
    },

    async deleteHost(host:any) {
      try {
        const response = await fetch(
          '/api/hosts/' + host?.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Host "${host?.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete host', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete host', 'error');
      }
    },

    async editHost(updateHostObj:any) {
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
        if (response.ok) {
          useToastStore().show(`Host "${updateHostObj.new_hostname}" updated`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update host', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update host', 'error');
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

    async createConfig(currentHost: any) {
      if (currentHost.length === 0) {
        useToastStore().show('Select a host probe to configure.', 'info');
        return;
      }
      try {
        useToastStore().show('Provisioning…', 'info');
        const response = await fetch(
          '/api/hosts/config',
          {
            method: 'POST',
            body: JSON.stringify(currentHost),
            mode: 'cors',
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Host "${currentHost.name}" submitted for provisioning`, 'success');
        } else {
          useToastStore().show('Provision request failed', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Provision request failed', 'error');
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
