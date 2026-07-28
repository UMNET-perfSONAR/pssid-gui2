// Startup validation of the SSO settings.
//
// Each case below is a real misconfiguration with a symptom that looks like
// something else: a wrong COOKIE_DOMAIN looks like a broken application, a short
// SECRET looks like nothing at all until someone forges a session, an
// unauthenticated Redis looks fine until the day the Docker network is not the
// only thing in front of it. The value of these tests is that each fault is
// rejected AT BOOT with a message that names the setting, instead of surfacing
// later as a support ticket.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveSsoSettings,
  buildAuthConfig,
  SsoConfigError,
} from '../oidc.service';

/** A complete, valid environment; individual cases break one thing at a time. */
const VALID = {
  ISSUER_BASE_URL: 'https://example-tenant.okta.com',
  BASE_URL: 'https://pssid.example.edu',
  COOKIE_DOMAIN: 'pssid.example.edu',
  CLIENT_ID: '0oa1example2client3id',
  CLIENT_SECRET: 'a-real-looking-client-secret-value',
  // A realistic `openssl rand -hex 32` value. Deliberately not 'f'.repeat(64):
  // that satisfies the length rule with no entropy, and the entropy floor
  // rejects it -- as it should, which is what the filler test below asserts.
  SECRET: '4d1f8ba36c07e592af4b0d7318ce6a25f90b3ed47c81596a2fb0e34d7c85a916',
  REDIS_URL: 'redis://:a-redis-password@redis:6379',
};

const MANAGED = [
  ...Object.keys(VALID),
  'SSO_SCOPE',
  'SESSION_ABSOLUTE_SECONDS',
  'SESSION_IDLE_SECONDS',
  'SSO_REQUIRE_GROUP',
  'SSO_PAR',
  'SSO_BACKCHANNEL_LOGOUT',
];

function setEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of MANAGED) delete process.env[key];
  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => setEnv());
afterEach(() => {
  for (const key of MANAGED) delete process.env[key];
});

describe('resolveSsoSettings: a valid environment', () => {
  it('accepts it and normalizes the URLs', () => {
    setEnv({ ISSUER_BASE_URL: 'https://example-tenant.okta.com/', BASE_URL: 'https://pssid.example.edu/' });
    const s = resolveSsoSettings();
    expect(s.issuerBaseURL).toBe('https://example-tenant.okta.com');
    expect(s.baseURL).toBe('https://pssid.example.edu');
  });

  it('defaults the scope to one Okta and Entra ID both accept', () => {
    // `edumember` is not a scope Okta defines, and requesting an undefined scope
    // fails the whole authorization request with invalid_scope.
    expect(resolveSsoSettings().scope).toBe('openid profile email groups');
  });

  it('honours an explicit scope for an eduPerson tenant', () => {
    setEnv({ SSO_SCOPE: 'openid profile email edumember groups' });
    expect(resolveSsoSettings().scope).toBe('openid profile email edumember groups');
  });

  it('defaults to an idle timeout well inside the absolute ceiling', () => {
    const s = resolveSsoSettings();
    expect(s.absoluteSeconds).toBe(7200);
    expect(s.idleSeconds).toBe(1800);
    expect(s.idleSeconds).toBeLessThan(s.absoluteSeconds);
  });

  it('requires a mapped group by default', () => {
    expect(resolveSsoSettings().requireGroup).toBe(true);
  });

  it('leaves the cookie host-only when COOKIE_DOMAIN is empty', () => {
    // The tightest option, and correct for a single-hostname deployment.
    setEnv({ COOKIE_DOMAIN: '' });
    expect(resolveSsoSettings().cookieDomain).toBeUndefined();
  });

  it('accepts a parent domain as the cookie domain', () => {
    setEnv({ COOKIE_DOMAIN: 'example.edu' });
    expect(resolveSsoSettings().cookieDomain).toBe('example.edu');
  });

  it('accepts a leading dot on the cookie domain and normalizes it away', () => {
    setEnv({ COOKIE_DOMAIN: '.example.edu' });
    expect(resolveSsoSettings().cookieDomain).toBe('example.edu');
  });

  // The parent-domain rule alone would accept a public suffix: "edu" IS a suffix
  // of pssid.example.edu. A browser discards a cookie scoped to one, so this
  // would pass validation and then loop at sign-in -- the exact failure the
  // COOKIE_DOMAIN checks exist to catch before the deployment is handed over.
  it('rejects a single-label cookie domain, even one the host ends with', () => {
    setEnv({ COOKIE_DOMAIN: 'edu' });
    expect(() => resolveSsoSettings()).toThrow(/public suffix/);
  });

  it('rejects a bare hostname with no dot', () => {
    setEnv({ COOKIE_DOMAIN: 'localhost' });
    expect(() => resolveSsoSettings()).toThrow(/public suffix/);
  });

  // "Two labels" is not sufficient on its own: co.uk is a suffix, not a domain
  // anyone controls, and a cookie scoped to it is discarded exactly like one
  // scoped to `uk`.
  it('rejects a multi-label public suffix the host ends with', () => {
    setEnv({ BASE_URL: 'https://pssid.example.co.uk', COOKIE_DOMAIN: 'co.uk' });
    expect(() => resolveSsoSettings()).toThrow(/public suffix/);
  });

  it('still accepts a real registrable domain under such a suffix', () => {
    setEnv({ BASE_URL: 'https://pssid.example.co.uk', COOKIE_DOMAIN: 'example.co.uk' });
    expect(resolveSsoSettings().cookieDomain).toBe('example.co.uk');
  });
});

describe('resolveSsoSettings: the issuer', () => {
  it('rejects an empty issuer', () => {
    setEnv({ ISSUER_BASE_URL: '' });
    expect(() => resolveSsoSettings()).toThrow(/ISSUER_BASE_URL is required/);
  });

  it('rejects plain HTTP', () => {
    setEnv({ ISSUER_BASE_URL: 'http://example-tenant.okta.com' });
    expect(() => resolveSsoSettings()).toThrow(/must use https/);
  });

  it('rejects a bare hostname with no scheme', () => {
    setEnv({ ISSUER_BASE_URL: 'example-tenant.okta.com' });
    expect(() => resolveSsoSettings()).toThrow(/not a valid absolute URL/);
  });

  it('rejects a query string or fragment', () => {
    setEnv({ ISSUER_BASE_URL: 'https://example-tenant.okta.com?x=1' });
    expect(() => resolveSsoSettings()).toThrow(/query string or fragment/);
  });
});

describe('resolveSsoSettings: the base URL', () => {
  it('rejects one with a path, since the redirect URI is derived from it', () => {
    setEnv({ BASE_URL: 'https://pssid.example.edu/app' });
    expect(() => resolveSsoSettings()).toThrow(/must be an origin with no path/);
  });

  it('rejects plain HTTP, because the session cookie is Secure-only', () => {
    setEnv({ BASE_URL: 'http://pssid.example.edu', COOKIE_DOMAIN: 'pssid.example.edu' });
    expect(() => resolveSsoSettings()).toThrow(/must use https/);
  });

  it('permits localhost over HTTP for a developer testing the flow', () => {
    setEnv({ BASE_URL: 'http://localhost:8888', COOKIE_DOMAIN: '' });
    expect(resolveSsoSettings().baseURL).toBe('http://localhost:8888');
  });
});

describe('resolveSsoSettings: the cookie domain', () => {
  it('rejects a domain that is not the BASE_URL host or a parent of it', () => {
    // THE classic cause of a sign-in that redirects forever: the cookie is set,
    // the browser discards it, the application starts the flow again.
    setEnv({ COOKIE_DOMAIN: 'somewhere-else.example.com' });
    expect(() => resolveSsoSettings()).toThrow(/does not match BASE_URL host/);
  });

  it('names the correct value in the error, so the fix needs no thought', () => {
    setEnv({ COOKIE_DOMAIN: 'wrong.example.com' });
    expect(() => resolveSsoSettings()).toThrow(/COOKIE_DOMAIN=pssid\.example\.edu/);
  });

  it('rejects a cookie domain given as a URL', () => {
    setEnv({ COOKIE_DOMAIN: 'https://pssid.example.edu' });
    expect(() => resolveSsoSettings()).toThrow(/bare hostname/);
  });

  it('rejects a sibling host that merely shares a suffix', () => {
    setEnv({ BASE_URL: 'https://pssid.example.edu', COOKIE_DOMAIN: 'notexample.edu' });
    expect(() => resolveSsoSettings()).toThrow(/does not match BASE_URL host/);
  });
});

describe('resolveSsoSettings: credentials and the session secret', () => {
  it('rejects the .env.example placeholders', () => {
    setEnv({ CLIENT_ID: 'your-client-id-here' });
    expect(() => resolveSsoSettings()).toThrow(/CLIENT_ID is required/);
    setEnv({ CLIENT_SECRET: 'your-client-secret-here' });
    expect(() => resolveSsoSettings()).toThrow(/CLIENT_SECRET is required/);
    setEnv({ SECRET: 'replace-with-a-long-random-string' });
    expect(() => resolveSsoSettings()).toThrow(/SECRET is required/);
  });

  it('rejects a session secret short enough to guess', () => {
    setEnv({ SECRET: 'tooshort' });
    expect(() => resolveSsoSettings()).toThrow(/at least 32/);
  });

  it('rejects a long secret that is really just filler', () => {
    // Length is a weak proxy for unguessability: this passes the length check
    // and has essentially no entropy.
    setEnv({ SECRET: 'a'.repeat(64) });
    expect(() => resolveSsoSettings()).toThrow(/distinct character/);
    setEnv({ SECRET: 'abababababababababababababababababab' });
    expect(() => resolveSsoSettings()).toThrow(/distinct character/);
  });

  it('accepts a genuine random secret', () => {
    // Guard against the entropy floor being set so high it rejects real values.
    setEnv({ SECRET: '9f3c1e7a45b2d8016c4fae92037bd5581ca7e46390fbd21847ce5093a6b1df72' });
    expect(() => resolveSsoSettings()).not.toThrow();
  });

  it('refuses to reuse the OIDC client secret as the session key', () => {
    // One leak would then compromise both, and rotating either breaks the other.
    setEnv({ SECRET: VALID.CLIENT_SECRET + 'padding-to-reach-32-characters' });
    expect(() => resolveSsoSettings()).not.toThrow();
    setEnv({ SECRET: 'shared-secret-value-used-in-two-places-x1' , CLIENT_SECRET: 'shared-secret-value-used-in-two-places-x1' });
    expect(() => resolveSsoSettings()).toThrow(/must not be the same value as CLIENT_SECRET/);
  });

  it('tells the operator how to generate one', () => {
    setEnv({ SECRET: '' });
    expect(() => resolveSsoSettings()).toThrow(/openssl rand -hex 32/);
  });
});

describe('resolveSsoSettings: the session store', () => {
  it('requires Redis, which holds the sessions', () => {
    setEnv({ REDIS_URL: '' });
    expect(() => resolveSsoSettings()).toThrow(/REDIS_URL is required/);
  });

  it('refuses an unauthenticated Redis', () => {
    // Anything that reaches Redis could read or forge a signed-in session, so
    // network isolation must not be the only control.
    setEnv({ REDIS_URL: 'redis://redis:6379' });
    expect(() => resolveSsoSettings()).toThrow(/carries no password/);
  });
});

describe('resolveSsoSettings: session lifetimes', () => {
  it('rejects a non-numeric duration instead of silently using a default', () => {
    setEnv({ SESSION_ABSOLUTE_SECONDS: 'two hours' });
    expect(() => resolveSsoSettings()).toThrow(/not valid/);
  });

  it('rejects an idle timeout that could never fire', () => {
    setEnv({ SESSION_ABSOLUTE_SECONDS: '3600', SESSION_IDLE_SECONDS: '7200' });
    expect(() => resolveSsoSettings()).toThrow(/exceeds SESSION_ABSOLUTE_SECONDS/);
  });

  it('rejects an absolute lifetime beyond a day', () => {
    setEnv({ SESSION_ABSOLUTE_SECONDS: '999999' });
    expect(() => resolveSsoSettings()).toThrow(/not valid/);
  });

  it('throws SsoConfigError, which index.ts turns into a refusal to boot', () => {
    setEnv({ SECRET: 'short' });
    expect(() => resolveSsoSettings()).toThrow(SsoConfigError);
  });
});

describe('buildAuthConfig', () => {
  it('uses the Authorization Code flow and no implicit tokens in the browser', () => {
    const config = buildAuthConfig(resolveSsoSettings(), {});
    expect(config.authorizationParams?.response_type).toBe('code');
  });

  it('pins the ID token algorithm so a downgraded signature is rejected', () => {
    expect(buildAuthConfig(resolveSsoSettings(), {}).idTokenSigningAlg).toBe('RS256');
  });

  it('sets a secure, httpOnly, SameSite=Lax session cookie', () => {
    const session = buildAuthConfig(resolveSsoSettings(), {}).session!;
    expect(session.cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' });
  });

  it('signs the session store cookie, so a session id cannot just be guessed', () => {
    const session = buildAuthConfig(resolveSsoSettings(), {}).session!;
    expect(session.signSessionStoreCookie).toBe(true);
    expect(session.requireSignedSessionStoreCookie).toBe(true);
  });

  it('applies BOTH an idle and an absolute session limit', () => {
    const session = buildAuthConfig(resolveSsoSettings(), {}).session!;
    expect(session.rolling).toBe(true);
    expect(session.rollingDuration).toBe(1800);
    expect(session.absoluteDuration).toBe(7200);
  });

  it('names the cookie, so it cannot collide with another app on the domain', () => {
    expect(buildAuthConfig(resolveSsoSettings(), {}).session!.name).toBe('pssid_session');
  });

  it('logs the user out of the provider too, not just this application', () => {
    expect(buildAuthConfig(resolveSsoSettings(), {}).idpLogout).toBe(true);
  });

  it('leaves authRequired off, so /api/* can answer 401 instead of redirecting', () => {
    // A 302 to the provider is useless to a fetch() call: it cannot follow a
    // cross-origin redirect with credentials, so an expired session would reach
    // the browser as an opaque network error. index.ts gates /api/* itself.
    expect(buildAuthConfig(resolveSsoSettings(), {}).authRequired).toBe(false);
  });

  it('keeps PAR and back-channel logout opt-in', () => {
    // Both require provider support; enabling them by default would stop the
    // server starting against a provider that does not advertise them.
    const config = buildAuthConfig(resolveSsoSettings(), {});
    expect(config.pushedAuthorizationRequests).toBe(false);
    expect(config.backchannelLogout).toBe(false);
  });

  it('turns them on when asked', () => {
    setEnv({ SSO_PAR: 'true', SSO_BACKCHANNEL_LOGOUT: 'true' });
    const config = buildAuthConfig(resolveSsoSettings(), {});
    expect(config.pushedAuthorizationRequests).toBe(true);
    expect(config.backchannelLogout).toBe(true);
  });
});
