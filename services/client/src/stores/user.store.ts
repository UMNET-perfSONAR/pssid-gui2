import {defineStore} from 'pinia'

// hard-code import
import config from '../shared/auth-groups.config.json';

// add more to User object if necessary
interface User {
    name: string;
    sub: string;
    email?: string | null;
    groups: string[];
  }

/** What the server reports it would let this caller do. */
type AccessLevel = 'none' | 'read' | 'write';

/**
 * Loop breaker for the sign-in redirect.
 *
 * If the session cookie is set but never comes back -- a COOKIE_DOMAIN that does
 * not match the site's hostname is the classic cause -- then "401, redirect to
 * the provider, come back, 401" is an infinite loop that pins the CPU and hides
 * the real fault behind a flickering browser. The server validates COOKIE_DOMAIN
 * at startup precisely to prevent that, but the browser is the only place that can
 * observe a cookie being dropped for some other reason, so it gets its own stop.
 *
 * The stop COUNTS attempts rather than timing them. A time window cannot work:
 * make it short and a user who spends a minute at the provider's password prompt
 * is not recognised as having come back, so the loop is never caught; make it long
 * and a legitimate re-authentication is reported as a failure. A counter is
 * correct however long the round trip takes -- and it is cleared on any successful
 * identity fetch, so a session that expires later gets a fresh allowance.
 *
 * Two attempts, because the second one is usually the informative one: the
 * provider still has its own session, so the round trip is immediate and a second
 * 401 proves the cookie is genuinely not surviving.
 */
const REDIRECT_COUNTER = 'pssid.sso.redirect_attempts';
const MAX_REDIRECTS = 2;

/** sessionStorage throws in some privacy modes; never let that block sign-in. */
function readAttempts(): number {
  try {
    return Number(sessionStorage.getItem(REDIRECT_COUNTER) || 0) || 0;
  } catch {
    return 0;
  }
}

function recordAttempt(n: number): void {
  try {
    sessionStorage.setItem(REDIRECT_COUNTER, String(n));
  } catch { /* see above */ }
}

function clearAttempts(): void {
  try {
    sessionStorage.removeItem(REDIRECT_COUNTER);
  } catch { /* see above */ }
}

/**
 * Coalesces concurrent callers. App.vue resolves the identity for the navigation
 * bar and every page also resolves it for its own form gating, so without this
 * there are two requests per page load AND two independent decisions about whether
 * to start a redirect -- the second of which would report a spurious failure.
 *
 * Module scope rather than store state, and self-clearing, so it never needs
 * resetting: across a navigation the sessionStorage counter above is what carries.
 */
let inFlight: Promise<void> | null = null;

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
    // The level the SERVER computed for this caller, from the same group mapping
    // its authorize() middleware uses. Authoritative where present: deriving it
    // in the browser from the group list means two implementations of one policy,
    // and the one in the browser is the one that can be stale.
    accessLevel: null as AccessLevel | null,
    // Set when sign-in is needed but could not be started automatically, so the
    // interface can offer the link instead of looping.
    authError: null as string | null,
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
      // Prefer the server's own verdict. The local group comparison below is the
      // fallback for an older server that does not send access_level, and it is
      // case-insensitive for the same reason the server's mapping is: directory
      // group names arrive with inconsistent case.
      if (state.accessLevel !== null) return state.accessLevel === 'write';
      const groups = state.user?.groups || [];
      const mapping = state.permissionsConfig as Record<string, unknown>;
      const lowered = new Map(
        Object.entries(mapping).map(([k, v]) => [k.trim().toLowerCase(), v])
      );
      return groups.some(group => {
        const perm = lowered.get(String(group).trim().toLowerCase());
        return perm === 'true' || perm === 'write' || perm === true;
      });
    },
    /** True once the identity request has landed, whatever its outcome. */
    isSignedIn: (state) => state.user !== null && state.user.sub !== null,
  },

  actions: {

    // No explicit `this` annotation: Pinia infers `this` as the store instance
    // inside actions, giving access to state/getters/actions. Annotating it (e.g.
    // `this: typeof useUserStore`) would instead type `this` as the store
    // *definition* factory, on which state fields like `isLoading` don't exist.
    /**
     * Resolve the signed-in identity. Safe to call from several components at
     * once: concurrent calls share one request and one decision.
     */
    async fetchUser() {
      if (inFlight) return inFlight;
      inFlight = this.loadUser().finally(() => { inFlight = null; });
      return inFlight;
    },

    async loadUser() {
      this.isLoading = true;
        try {
          const res = await fetch('/api/userinfo', {
            credentials: 'include',
          });

          // 401 means SSO is on and this browser has no session. The server sends
          // the sign-in URL with the response, so the interface can start the
          // flow rather than rendering an application the user cannot use.
          if (res.status === 401) {
            this.user = null;
            this.accessLevel = 'none';
            this.ssoEnabled = true;
            let loginUrl = '/login';
            try {
              const body = await res.json();
              if (typeof body?.login_url === 'string') loginUrl = body.login_url;
            } catch { /* fall back to /login */ }

            const attempts = readAttempts();
            if (attempts >= MAX_REDIRECTS) {
              clearAttempts();
              this.authError =
                'Signing in did not produce a session. This usually means the session ' +
                'cookie is being discarded: check that COOKIE_DOMAIN matches the site ' +
                'hostname, that the site is served over HTTPS, and that the clock on ' +
                'the server is correct.';
              return;
            }

            recordAttempt(attempts + 1);
            // A full navigation, not fetch(): the provider's authorization page
            // has to be reached at the top level, and an XHR cannot follow a
            // cross-origin redirect with credentials.
            window.location.assign(loginUrl);
            return;
          }

          if (!res.ok) throw new Error('User info fetch failed');

          const data = await res.json();
          this.user = {
            name: data.name,
            sub: data.sub,
            email: data.email ?? null,
            groups: data.groups || [],
          };
          this.authError = null;
          // Sign-in worked, so the loop allowance resets: a session that expires
          // hours from now must get a fresh set of attempts, not inherit the ones
          // spent when this tab was first opened.
          clearAttempts();
          // Absent on an older server: leave null so the compiled defaults
          // continue to apply rather than reading `undefined` as false.
          this.ssoEnabled = typeof data.sso_enabled === 'boolean' ? data.sso_enabled : null;
          this.openWrite = typeof data.open_write === 'boolean' ? data.open_write : null;
          this.accessLevel =
            data.access_level === 'none' || data.access_level === 'read' || data.access_level === 'write'
              ? data.access_level
              : null;
        } catch (err) {
          console.error('Failed to fetch user info:', err);
          this.user = null;
        } finally {
          this.isLoading = false;
        }
      },

    /**
     * Sign out. A full navigation to the server's /logout, which clears the local
     * session and then, because idpLogout is on, forwards to the provider so the
     * identity session ends too. Anything less leaves the next visitor to this
     * browser one click from being signed straight back in.
     */
    signOut() {
      window.location.assign('/logout');
    },
    },
})
