// @vitest-environment jsdom
// The sign-in path.
//
// With SSO on, this store is what turns a 401 into a trip to the identity
// provider. It is the only route into the application, so its edges matter: a
// redirect that never fires locks everyone out, and one that fires unconditionally
// is an infinite loop that hides the real fault behind a flickering browser.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserStore } from '../user.store';

const assign = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

/** A /api/userinfo response. */
function ok(body: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
function unauthorized(body: Record<string, unknown> = { error: 'Not authenticated', login_url: '/login' }) {
  return { ok: false, status: 401, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  setActivePinia(createPinia());
  sessionStorage.clear();
  assign.mockClear();
  // jsdom refuses a real navigation, so location is replaced wholesale.
  Object.defineProperty(window, 'location', {
    value: { assign, href: 'https://pssid.example.edu/hosts' },
    writable: true,
    configurable: true,
  });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('a signed-in user', () => {
  it('records the identity, posture and server-computed access level', async () => {
    fetchMock.mockResolvedValue(
      ok({
        name: 'Alex Operator',
        sub: '00u123',
        email: 'alex@example.edu',
        groups: ['pssid-gui-admins'],
        access_level: 'write',
        sso_enabled: true,
        open_write: false,
      })
    );
    const store = useUserStore();
    await store.fetchUser();

    expect(store.user).toMatchObject({ name: 'Alex Operator', sub: '00u123' });
    expect(store.accessLevel).toBe('write');
    expect(store.ssoEnabled).toBe(true);
    expect(store.canWrite).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });

  it('trusts the server\'s level over a local group comparison', async () => {
    // The mapping compiled into the bundle can be stale; the server's verdict
    // comes from the mapping its own authorize() middleware enforces.
    fetchMock.mockResolvedValue(
      ok({ name: 'R', sub: '1', groups: ['some-group'], access_level: 'read', sso_enabled: true })
    );
    const store = useUserStore();
    await store.fetchUser();
    expect(store.canWrite).toBe(false);
  });

  it('reports write access with SSO off and OPEN_WRITE on', async () => {
    fetchMock.mockResolvedValue(
      ok({ name: null, sub: null, groups: [], access_level: 'write', sso_enabled: false, open_write: true })
    );
    const store = useUserStore();
    await store.fetchUser();
    expect(store.canWrite).toBe(true);
    expect(store.authError).toBeNull();
  });

  it('leaves the posture null on an older server that does not report it', async () => {
    // null means "unknown", so callers fall back to the compiled defaults rather
    // than reading undefined as false and disabling every form.
    fetchMock.mockResolvedValue(ok({ name: 'A', sub: '1', groups: [] }));
    const store = useUserStore();
    await store.fetchUser();
    expect(store.ssoEnabled).toBeNull();
    expect(store.openWrite).toBeNull();
    expect(store.accessLevel).toBeNull();
  });
});

describe('an unauthenticated browser', () => {
  it('is sent to the sign-in URL the server supplied', async () => {
    // A non-default path, so this proves the client follows what the server sent
    // rather than hard-coding /login. The real server sends a bare /login (the
    // provider's login route ignores any returnTo), but the client must not
    // depend on that.
    fetchMock.mockResolvedValue(unauthorized({ login_url: '/auth/start' }));
    const store = useUserStore();
    await store.fetchUser();

    expect(assign).toHaveBeenCalledWith('/auth/start');
    expect(store.user).toBeNull();
    expect(store.accessLevel).toBe('none');
    expect(store.authError).toBeNull();
  });

  it('falls back to /login when the response carries no URL', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => { throw new Error('no body'); } });
    const store = useUserStore();
    await store.fetchUser();
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('starts the flow ONCE when several components ask at the same time', async () => {
    // App.vue resolves the identity for the navigation bar and every page also
    // resolves it for form gating. Without coalescing that is two requests and,
    // worse, two independent decisions to navigate.
    fetchMock.mockResolvedValue(unauthorized());
    const store = useUserStore();
    await Promise.all([store.fetchUser(), store.fetchUser(), store.fetchUser()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(store.authError).toBeNull();
  });
});

describe('the redirect loop breaker', () => {
  const COUNTER = 'pssid.sso.redirect_attempts';

  /**
   * Each fetchUser() below stands for one page load. sessionStorage is what
   * actually survives a navigation in a browser, so driving the counter through it
   * is a faithful simulation and needs no module gymnastics.
   */
  it('gives up after two attempts and explains why', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    const store = useUserStore();

    await store.fetchUser();
    expect(assign).toHaveBeenCalledTimes(1);

    await store.fetchUser();
    expect(assign).toHaveBeenCalledTimes(2);

    // Third load: still no session, so stop and report it rather than loop.
    await store.fetchUser();
    expect(assign).toHaveBeenCalledTimes(2);
    expect(store.authError).toMatch(/did not produce a session/i);
    expect(store.authError).toMatch(/COOKIE_DOMAIN/);
  });

  it('counts attempts rather than timing them, so a slow provider is fine', async () => {
    // A user who spends a minute at a password prompt must not be treated as a
    // fresh visitor, which is exactly what a short time window would do.
    fetchMock.mockResolvedValue(unauthorized());
    await useUserStore().fetchUser();
    expect(sessionStorage.getItem(COUNTER)).toBe('1');
  });

  it('resets the allowance once sign-in succeeds', async () => {
    // Otherwise a session that expires hours later inherits attempts spent when
    // the tab was first opened, and the user is told sign-in is broken.
    const store = useUserStore();
    fetchMock.mockResolvedValue(unauthorized());
    await store.fetchUser();
    expect(sessionStorage.getItem(COUNTER)).toBe('1');

    fetchMock.mockResolvedValue(ok({ name: 'A', sub: '1', groups: [], access_level: 'write' }));
    await store.fetchUser();
    expect(sessionStorage.getItem(COUNTER)).toBeNull();

    // And the allowance really is fresh: a later expiry redirects again.
    fetchMock.mockResolvedValue(unauthorized());
    await store.fetchUser();
    expect(assign).toHaveBeenCalledTimes(2);
    expect(store.authError).toBeNull();
  });
});

describe('a failed request', () => {
  it('clears the user without navigating anywhere', async () => {
    // A network blip or a 500 is not an authentication problem, and bouncing the
    // user to the provider would only obscure it.
    fetchMock.mockRejectedValue(new Error('network down'));
    const store = useUserStore();
    await store.fetchUser();
    expect(store.user).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
  });

  it('does not navigate on a 403', async () => {
    // 403 means authenticated but not entitled; signing in again cannot help.
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Access denied' }) });
    const store = useUserStore();
    await store.fetchUser();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('navigates to the server route, which also ends the provider session', async () => {
    useUserStore().signOut();
    expect(assign).toHaveBeenCalledWith('/logout');
  });
});
