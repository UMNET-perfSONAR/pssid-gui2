import {defineStore} from 'pinia'
import { useHostStore } from './host_store';
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useGroupStore = defineStore('groupStore', {
  state: () => ({
    host_groups: [{
      name:'',
      hosts: [''],
      batches: [''],
      data: [{}],
    }],
    filteredData: [{}],
    isLoading: false,
    filteredHostData: [{}],
    hostData: [],
    hostStore: useHostStore(),
    isError: false
  }),
  actions: {
    async getGroups() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/host-groups', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.host_groups = data;
        this.filteredData = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to load host groups', 'error');
      }
    },

    async addGroup(host_group:any) {
      try {
        this.isLoading = true;
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

        if (response.ok) {
          this.host_groups.push(host_group);
          useToastStore().show(`Host group "${host_group.name}" added`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add host group', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to add host group', 'error');
      }
    },

    async editGroup(host_group: any) {
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
        if (response.ok) {
          useToastStore().show(`Host group "${host_group.new_hostgroup}" updated`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update host group', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to update host group', 'error');
      }
    },

    async deleteGroup(host_group:any) {
      try {
        const response = await fetch(
          '/api/host-groups/' + host_group.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`Group "${host_group.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete host group', 'error');
        }
      }
      catch(error) {
        console.error(error);
        this.isError = true;
        useToastStore().show('Failed to delete host group', 'error');
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/host-groups', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.host_groups = [];
        this.filteredData = [];
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
          useToastStore().show('Provision request failed', 'error');
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
