import {defineStore} from 'pinia'
import config from '../shared/config'
import { useToastStore } from './toast.store'
import { errorMessage } from '../utils/http'

export const useSsidStore = defineStore('ssidStore', {
  state: () => ({
    ssid_profiles: [] as any[],
    isLoading: false
  }),

  // Every mutating action resolves to true on success and false on failure,
  // so a view can keep the user's typed input when the server says no.
  actions: {
    async getSsidProfiles(): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await fetch('/api/ssid-profiles', {
          ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
        });
        if (!res.ok) {
          useToastStore().show(await errorMessage(res, 'Failed to load SSID profiles'), 'error');
          return false;
        }
        this.ssid_profiles = await res.json();
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to load SSID profiles', 'error');
        return false;
      }
      finally {
        this.isLoading = false;
      }
    },

    async addSsidProfile(ssid_profile: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/ssid-profiles/create-ssidProfile',
          {
            method: 'POST',
            body: JSON.stringify(ssid_profile),
            headers: { "Content-Type": "application/json" },
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to add SSID profile'), 'error');
          return false;
        }
        this.ssid_profiles.push(ssid_profile);
        useToastStore().show(`SSID profile "${ssid_profile.name}" added`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to add SSID profile', 'error');
        return false;
      }
    },

    async deleteSsidProfile(ssid_profile: any): Promise<boolean> {
      try {
        const response = await fetch(
          '/api/ssid-profiles/' + encodeURIComponent(ssid_profile.name),
          {
            method: 'DELETE',
            ...(config.ENABLE_SSO ? { credentials: 'include' } : {})
          }
        );
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to delete SSID profile'), 'error');
          return false;
        }
        useToastStore().show(`SSID profile "${ssid_profile.name}" deleted`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to delete SSID profile', 'error');
        return false;
      }
    },

    async editSsidProfile(ssid_profile: any): Promise<boolean> {
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
        if (!response.ok) {
          useToastStore().show(await errorMessage(response, 'Failed to update SSID profile'), 'error');
          return false;
        }
        useToastStore().show(`SSID profile "${ssid_profile.new_ssid_name}" updated`, 'success');
        return true;
      }
      catch(error) {
        console.error(error);
        useToastStore().show('Failed to update SSID profile', 'error');
        return false;
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
