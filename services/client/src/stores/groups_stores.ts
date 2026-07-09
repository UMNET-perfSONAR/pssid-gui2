import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'
import { errorMessage } from '../utils/http'

export const useGroupStore = defineStore('groupStore', {
  state: () => ({
    host_groups: [] as any[],
    isLoading: false,
    isError: false
  }),

  // Every mutating action resolves to true on success and false on failure,
  // so a view can keep the user's typed input when the server says no.
  actions: {
    async getGroups(): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await fetch('/api/host-groups', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load host groups'), 'error');
          return false;
        }
        this.host_groups = await res.json();
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load host groups', 'error');
        return false;
      }
      finally {
        this.isLoading = false;
      }
    },

    async addGroup(host_group: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/host-groups/create-hostgroup',
          {
            method: 'POST',
            body: JSON.stringify(host_group),
            mode: 'cors',
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to add host group'), 'error');
          return false;
        }
        this.host_groups.push(host_group);
        useToastStore().show(`Host group "${host_group.name}" added`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add host group', 'error');
        return false;
      }
    },

    async editGroup(host_group: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/host-groups/update-hostgroup',
          {
            method: 'PUT',
            mode: 'cors',
            body: JSON.stringify(host_group),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to update host group'), 'error');
          return false;
        }
        useToastStore().show(`Host group "${host_group.new_hostgroup}" updated`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update host group', 'error');
        return false;
      }
    },

    async deleteGroup(host_group: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/host-groups/' + encodeURIComponent(host_group.name),
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to delete host group'), 'error');
          return false;
        }
        useToastStore().show(`Group "${host_group.name}" deleted`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete host group', 'error');
        return false;
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/host-groups', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.host_groups = [];
      }
      catch(error) {
        console.error(error);
        this.isError = true;
      }
    },

    async createConfig(currentGroup: any) {
      if (!currentGroup || !currentGroup.name) {
        useToastStore().show('Select a host group to configure.', 'info');
        return;
      }
      try {
        useToastStore().show('Provisioning…', 'info');
        const response = await fetch(
          '/api/host-groups/config',
          {
            method: 'POST',
            body: JSON.stringify(currentGroup),
            mode: 'cors',
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Group "${currentGroup.name}" submitted for provisioning`, 'success');
        } else {
          useToastStore().show(await errorMessage(response, 'Provision request failed'), 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Provision request failed', 'error');
      }
    },
  }
})
