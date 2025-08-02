import {defineStore} from 'pinia'

// hard-code import
import config from '../shared/auth-groups.config.json';

// add more to User object if necessary
interface User {
    name: string;
    sub: string;
    groups: string[];
  }

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as User | null,
    isLoading: false,
    writeGroups: [] as string[], // dynamically add more groups to here if needed
    permissionsConfig: config.permissions || {},
  }),
  getters: {
    isInGroup: (state) => {
      return (groups: string | string[]) => {
        if (!state.user?.groups) return false;
        const groupList = Array.isArray(groups) ? groups : [groups];
        return groupList.some(group => state.user.groups.includes(group));
      };
    },
    canWrite: (state) => {
      const groups = state.user?.groups || [];
      return groups.some(group => {
        const perm = state.permissionsConfig[group];
        return perm === 'true' || perm === 'write';
      });
    },
  },

  actions: {

    async fetchUser(this: typeof useUserStore) {
      this.isLoading = true;
        try {
          const res = await fetch('https://'+ window.location.hostname + ':8000/api/userinfo', {
            credentials: 'include',
          });
          if (!res.ok) throw new Error('User info fetch failed');
  
          const data = await res.json();
          this.user = {
            name: data.name,
            sub: data.sub,
            groups: data.groups || [],
          };
        } catch (err) {
          console.error('Failed to fetch user info:', err);
          this.user = null;
        } finally {
          this.isLoading = false;
        }
      },
      // async loadPermissionsConfig(this: typeof useUserStore.prototype) {
      //   try {
      //     const res = await fetch('/api/authconfig');
      //     const data = await res.json();
      //     this.permissionsConfig = data.permissions || {};
      //   } catch (err) {
      //     console.error('Failed to load permissions config:', err);
      //     this.permissionsConfig = {};
      //   }
      // },
    },
})
