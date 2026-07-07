import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'

export const useSsidStore = defineStore('ssidStore', {
  state: () => ({
    ssid_profiles: [{}],
    isLoading: false
  }),

  actions: {
    async getSsidProfiles() {
      try {
        this.isLoading = true;
        const res = await fetch('/api/ssid-profiles', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        const data = await res.json();
        this.ssid_profiles = data;
        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to load SSID profiles', 'error');
      }
    },

    async addSsidProfile(ssid_profile:any) {
      try {
        this.isLoading = true;
        const response = await fetch(
          '/api/ssid-profiles/create-ssidProfile',
          {
            method: 'POST',
            body: JSON.stringify(ssid_profile),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );

        if (response.ok) {
          this.ssid_profiles.push(ssid_profile);
          useToastStore().show(`SSID profile "${ssid_profile.name}" added`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to add SSID profile', 'error');
        }

        this.isLoading = false;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to add SSID profile', 'error');
      }
    },

    async deleteSsidProfile(ssid_profile:any) {
      try {
        const response = await fetch(
          '/api/ssid-profiles/' + ssid_profile.name,
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`SSID profile "${ssid_profile.name}" deleted`, 'success');
        } else {
          useToastStore().show('Failed to delete SSID profile', 'error');
        }
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to delete SSID profile', 'error');
      }
    },

    async editSsidProfile(ssid_profile:any) {
      try {
        const response = await fetch(
          '/api/ssid-profiles/update-ssidProfile',
          {
            method: "PUT",
            mode: "cors",
            body: JSON.stringify(ssid_profile),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (response.ok) {
          useToastStore().show(`SSID profile "${ssid_profile.new_ssid_name}" updated`, 'success');
        } else {
          const text = await response.text();
          const errorData = text ? JSON.parse(text) : {};
          useToastStore().show(errorData.message || 'Failed to update SSID profile', 'error');
        }
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to update SSID profile', 'error');
      }
    },

    async deleteAll() {
      try {
        await fetch('/api/ssid-profiles', {
          method: 'DELETE',
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        this.ssid_profiles = [];
      }
      catch(error) {
        console.error(error);
      }
    }
  }
})
