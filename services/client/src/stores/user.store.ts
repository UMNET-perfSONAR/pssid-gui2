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
    // The server's EFFECTIVE auth posture, from /api/userinfo. null means "not
    // known yet" (first render, or the request failed), and callers fall back to
    // the values compiled into shared/config.ts. These exist because the
    // compiled values are only build-time defaults: an operator can override
    // ENABLE_SSO/OPEN_WRITE in the environment without rebuilding, and the
    // browser has no other way to find that out.
    ssoEnabled: null as boolean | null,
    openWrite: null as boolean | null,
  }),
  getters: {
    isInGroup: (state) => {
      return (groups: string | string[]) => {
        const userGroups = state.user?.groups;
        if (!userGroups) return false;
        const groupList = Array.isArray(groups) ? groups : [groups];
        return groupList.some(group => userGroups.includes(group));
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
          const res = await fetch('/api/userinfo', {
            credentials: 'include',
          });
          if (!res.ok) throw new Error('User info fetch failed');
  
          const data = await res.json();
          this.user = {
            name: data.name,
            sub: data.sub,
            groups: data.groups || [],
          };
          // Absent on an older server: leave null so the compiled defaults
          // continue to apply rather than reading `undefined` as false.
          this.ssoEnabled = typeof data.sso_enabled === 'boolean' ? data.sso_enabled : null;
          this.openWrite = typeof data.open_write === 'boolean' ? data.open_write : null;
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
