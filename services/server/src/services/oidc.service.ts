// Single sign-on: everything that turns environment values into a validated,
// hardened OIDC configuration.
//
// The server speaks generic OIDC through express-openid-connect, so any
// compliant provider works. Okta is the reference provider and the one
// umich/QA/SSOwithOkta.md walks through end to end; nothing in here is Okta-specific.
//
// Two responsibilities:
//
//   1. Refuse to start a misconfigured SSO deployment. Every value below has a
//      failure mode that manifests as a redirect loop, a blank screen or -- worst
//      -- an application that authenticates nobody while appearing to work. Each
//      is checked once, at startup, with an error that names the fix.
//
//   2. Enforce authorization at the moment of login. A user whose token carries
//      no group this deployment recognizes never gets a session, so the failure
//      is a clear message at sign-in rather than an interface that loads and then
//      refuses every action.

import type { ConfigParams } from 'express-openid-connect';
import {
  getUserAccessLevel,
  resolveUserGroups,
  permissionMappingStatus,
  SESSION_NAME,
  SESSION_GROUPS_KEY,
} from '../shared/accessControl';

/**
 * Marker prefix for sign-in records, so they can be extracted from mixed output
 * with a grep. Deliberately distinct from audit.service's AUDIT: these are
 * authentication events, not API activity, and an operator usually wants one or
 * the other rather than both interleaved.
 */
export const AUTH_PREFIX = 'AUTH';

/** Thrown when a valid identity is not entitled to use this deployment. */
export class SsoAccessDeniedError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'SsoAccessDeniedError';
  }
}

/** Thrown for a configuration fault; index.ts turns this into a refusal to boot. */
export class SsoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsoConfigError';
  }
}

// ─── Environment helpers ────────────────────────────────────────────────────

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new SsoConfigError(
      `${name}="${raw}" is not valid. Expected a whole number of seconds between ${min} and ${max}.`
    );
  }
  return n;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/** Values a .env.example placeholder would leave behind. */
const PLACEHOLDERS = [
  'your-client-id-here',
  'your-client-secret-here',
  'replace-with-a-long-random-string',
  'changeme',
];

const isPlaceholder = (v: string): boolean =>
  PLACEHOLDERS.some((p) => v.trim().toLowerCase() === p);

// ─── Validated settings ─────────────────────────────────────────────────────

export interface SsoSettings {
  issuerBaseURL: string;
  baseURL: string;
  clientID: string;
  clientSecret: string;
  secret: string;
  cookieDomain: string | undefined;
  scope: string;
  /** Seconds after login at which the session ends regardless of activity. */
  absoluteSeconds: number;
  /** Seconds of inactivity after which the session ends. */
  idleSeconds: number;
  /** Deny login to an identity with no group mapped to a permission. */
  requireGroup: boolean;
  /** Use Pushed Authorization Requests (provider must advertise the endpoint). */
  pushedAuthorizationRequests: boolean;
  /** Accept provider-initiated back-channel logout tokens. */
  backchannelLogout: boolean;
}

/**
 * The scope requested at login.
 *
 * `groups` is what Okta and Entra ID need in order to release group membership.
 * It is NOT universal: a provider that does not define a scope by that name
 * rejects the whole authorization request with `invalid_scope`, which is why
 * this is configurable rather than hard-coded. A federated higher-education
 * tenant that releases the eduPerson attribute instead wants
 * `SSO_SCOPE="openid profile email edumember groups"`; accessControl.ts reads
 * either claim, so only the request side differs.
 */
const DEFAULT_SCOPE = 'openid profile email groups';

/**
 * Multi-label public suffixes a deployment might plausibly mistake for its own
 * domain. Single-label suffixes (`edu`, `com`) need no list -- they are caught by
 * "contains no dot" -- so only the two-label forms appear here, weighted towards
 * the higher-education and government tenants this application is deployed into.
 */
const PUBLIC_SUFFIXES = new Set([
  'co.uk', 'ac.uk', 'org.uk', 'gov.uk', 'net.uk', 'sch.uk',
  'co.jp', 'ac.jp', 'go.jp', 'or.jp',
  'com.au', 'edu.au', 'gov.au', 'net.au', 'org.au',
  'co.nz', 'ac.nz', 'govt.nz',
  'com.br', 'edu.br', 'gov.br',
  'co.in', 'ac.in', 'edu.in', 'gov.in',
  'co.za', 'ac.za', 'gov.za',
  'com.cn', 'edu.cn', 'gov.cn',
  'com.mx', 'edu.mx', 'gob.mx',
  'com.sg', 'edu.sg', 'gov.sg',
  'co.kr', 'ac.kr', 'go.kr',
  'com.tr', 'edu.tr', 'gov.tr',
  'com.hk', 'edu.hk', 'gov.hk',
]);

/** Normalize a URL-ish setting: trim, drop a trailing slash, reject junk. */
function requireUrl(name: string, raw: string | undefined, opts: { requireHttps: boolean }): string {
  const value = (raw ?? '').trim();
  if (value === '') {
    throw new SsoConfigError(`${name} is required when SSO is enabled but is empty.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SsoConfigError(`${name}="${value}" is not a valid absolute URL (include https://).`);
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new SsoConfigError(`${name}="${value}" must not carry a query string or fragment.`);
  }
  // localhost is exempt: a developer testing the OIDC flow against a local
  // provider has no certificate, and the browser treats localhost as a secure
  // context anyway. Everything else must be HTTPS -- the session cookie is
  // Secure-only, so plain HTTP produces a silent redirect loop, and the
  // authorization code would cross the network in the clear.
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (opts.requireHttps && parsed.protocol !== 'https:' && !isLocal) {
    throw new SsoConfigError(
      `${name}="${value}" must use https. The session cookie is Secure-only, so ` +
        `over plain HTTP sign-in loops instead of completing.`
    );
  }
  return value.replace(/\/+$/, '');
}

/**
 * Read and validate every SSO setting. Throws SsoConfigError with an actionable
 * message on the first problem; call once at startup.
 */
export function resolveSsoSettings(): SsoSettings {
  const issuerBaseURL = requireUrl('ISSUER_BASE_URL', process.env.ISSUER_BASE_URL, {
    requireHttps: true,
  });
  const baseURL = requireUrl('BASE_URL', process.env.BASE_URL, { requireHttps: true });

  if (new URL(baseURL).pathname !== '/') {
    throw new SsoConfigError(
      `BASE_URL="${baseURL}" must be an origin with no path. The OIDC redirect URI is ` +
        `derived from it as <BASE_URL>/callback.`
    );
  }

  const clientID = (process.env.CLIENT_ID ?? '').trim();
  if (clientID === '' || isPlaceholder(clientID)) {
    throw new SsoConfigError(
      'CLIENT_ID is required when SSO is enabled and must be the client id issued by ' +
        'your provider, not the example placeholder.'
    );
  }

  const clientSecret = (process.env.CLIENT_SECRET ?? '').trim();
  if (clientSecret === '' || isPlaceholder(clientSecret)) {
    throw new SsoConfigError(
      'CLIENT_SECRET is required when SSO is enabled and must be the client secret ' +
        'issued by your provider, not the example placeholder.'
    );
  }

  // Signs the session cookie. A guessable value lets anyone mint a session, so
  // this is checked for length as well as presence. install.sh generates 64 hex
  // characters with `openssl rand -hex 32`.
  const secret = (process.env.SECRET ?? '').trim();
  if (secret === '' || isPlaceholder(secret)) {
    throw new SsoConfigError(
      'SECRET is required when SSO is enabled. Generate one with: openssl rand -hex 32'
    );
  }
  if (secret.length < 32) {
    throw new SsoConfigError(
      `SECRET is ${secret.length} characters; at least 32 are required. It signs the ` +
        `session cookie, so a short value is guessable. Generate one with: openssl rand -hex 32`
    );
  }
  // Length alone is a weak proxy for unguessability: 64 copies of one character
  // satisfies it and has almost no entropy. Counting distinct characters is a
  // crude but effective floor -- it rejects padded or repeated filler while never
  // troubling a real random value, since 32+ characters drawn from any sane
  // alphabet containing fewer than 8 distinct symbols is vanishingly unlikely
  // (hex alone gives 16). This is a sanity check against a hand-typed secret,
  // not an entropy estimator.
  const distinct = new Set(secret).size;
  if (distinct < 8) {
    throw new SsoConfigError(
      `SECRET is long enough but contains only ${distinct} distinct character(s), so it ` +
        `is filler rather than a random value. It signs the session cookie: anyone who ` +
        `guesses it can mint a valid session. Generate one with: openssl rand -hex 32`
    );
  }
  // A copy-paste slip that is invisible afterwards: reusing the OIDC client
  // secret as the session-signing key means one leak compromises both, and
  // rotating either silently breaks the other.
  if (secret === clientSecret) {
    throw new SsoConfigError(
      'SECRET must not be the same value as CLIENT_SECRET. They protect different ' +
        'things and are rotated independently. Generate one with: openssl rand -hex 32'
    );
  }

  // The cookie domain decides whether the browser sends the session back at all.
  // A value that is not the BASE_URL host (or a parent of it) is the single most
  // common cause of "sign-in redirects forever": the cookie is set, then dropped
  // on the next request, so the application starts the flow again.
  const baseHost = new URL(baseURL).hostname;
  const rawCookieDomain = (process.env.COOKIE_DOMAIN ?? '').trim();
  let cookieDomain: string | undefined;
  if (rawCookieDomain !== '') {
    const normalized = rawCookieDomain.replace(/^\./, '').toLowerCase();
    if (/^https?:\/\//i.test(rawCookieDomain)) {
      throw new SsoConfigError(
        `COOKIE_DOMAIN="${rawCookieDomain}" must be a bare hostname, with no scheme ` +
          `(for example ${baseHost}).`
      );
    }
    // A cookie scoped to a public suffix is discarded by every browser, so the
    // parent-domain test below would accept COOKIE_DOMAIN=edu for
    // pssid.example.edu and produce exactly the sign-in loop this validation
    // exists to prevent. Two checks, because a suffix is not always one label:
    //
    //   * anything with no dot at all (`edu`, `com`, a bare hostname), and
    //   * the multi-label suffixes common in this application's audience --
    //     university and government deployments outside the US.
    //
    // Deliberately NOT a full Public Suffix List: that is a ~10k-entry file with
    // its own update cadence, and pulling it in to validate one optional setting
    // would be a dependency worth more than the check. This catches the
    // plausible mistakes; an exotic suffix would still fail in the browser.
    if (!normalized.includes('.') || PUBLIC_SUFFIXES.has(normalized)) {
      throw new SsoConfigError(
        `COOKIE_DOMAIN="${rawCookieDomain}" is a public suffix, not a domain you ` +
          `control. A browser discards a cookie scoped to one, so sign-in would ` +
          `loop. Set COOKIE_DOMAIN=${baseHost}, or leave it empty for a host-only cookie.`
      );
    }
    const host = baseHost.toLowerCase();
    if (host !== normalized && !host.endsWith(`.${normalized}`)) {
      throw new SsoConfigError(
        `COOKIE_DOMAIN="${rawCookieDomain}" does not match BASE_URL host "${baseHost}". ` +
          `The browser would discard the session cookie and sign-in would loop. Set ` +
          `COOKIE_DOMAIN=${baseHost} or leave it empty for a host-only cookie.`
      );
    }
    cookieDomain = normalized;
  }

  // The session store is Redis when SSO is on (see index.ts): a cookie-only
  // session cannot hold an ID token with a large groups claim, and a restart
  // would sign everyone out.
  const redisUrl = (process.env.REDIS_URL ?? '').trim();
  if (redisUrl === '') {
    throw new SsoConfigError(
      'REDIS_URL is required when SSO is enabled: Redis holds the session store. ' +
        'install.sh writes it; for compose the value is redis://:<password>@redis:6379'
    );
  }
  // Redis holds live sessions, so anything that reaches it can read or forge a
  // signed-in identity. Network isolation should not be the only control.
  try {
    if (new URL(redisUrl).password === '') {
      throw new SsoConfigError(
        'REDIS_URL carries no password. Redis holds the session store, so it must ' +
          'require authentication: redis://:<password>@redis:6379 (install.sh generates one).'
      );
    }
  } catch (err) {
    if (err instanceof SsoConfigError) throw err;
    throw new SsoConfigError(`REDIS_URL="${redisUrl}" is not a valid URL.`);
  }

  const absoluteSeconds = envInt('SESSION_ABSOLUTE_SECONDS', 7200, 300, 86400);
  const idleSeconds = envInt('SESSION_IDLE_SECONDS', 1800, 60, 86400);
  if (idleSeconds > absoluteSeconds) {
    throw new SsoConfigError(
      `SESSION_IDLE_SECONDS (${idleSeconds}) exceeds SESSION_ABSOLUTE_SECONDS ` +
        `(${absoluteSeconds}), so the idle timeout could never fire. Lower the idle value.`
    );
  }

  return {
    issuerBaseURL,
    baseURL,
    clientID,
    clientSecret,
    secret,
    cookieDomain,
    scope: (process.env.SSO_SCOPE ?? '').trim() || DEFAULT_SCOPE,
    absoluteSeconds,
    idleSeconds,
    requireGroup: envBool('SSO_REQUIRE_GROUP', true),
    pushedAuthorizationRequests: envBool('SSO_PAR', false),
    backchannelLogout: envBool('SSO_BACKCHANNEL_LOGOUT', false),
  };
}

// ─── Reading groups out of a freshly issued token ───────────────────────────

/** Decode a JWT payload. The token was just verified by the OIDC client. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

// The discovery document is immutable in practice; fetch it once per process.
let userinfoEndpoint: string | null = null;

async function resolveUserinfoEndpoint(issuerBaseURL: string): Promise<string | null> {
  if (userinfoEndpoint) return userinfoEndpoint;
  try {
    const res = await fetch(`${issuerBaseURL}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as { userinfo_endpoint?: unknown };
    if (typeof doc.userinfo_endpoint === 'string') {
      userinfoEndpoint = doc.userinfo_endpoint;
      return userinfoEndpoint;
    }
  } catch (err) {
    console.warn('Could not read the OIDC discovery document:', err);
  }
  return null;
}

/**
 * Ask the provider's userinfo endpoint for the groups claim.
 *
 * Needed because a groups claim can be scoped to the userinfo response rather
 * than the ID token -- in Okta that is the difference between a claim included
 * "Always" and one included on a "Userinfo / id_token request". Without this
 * fallback such a tenant authenticates users whose group list is empty, and
 * every one of them is denied for a reason that is invisible from the token.
 */
async function fetchGroupsFromUserinfo(
  issuerBaseURL: string,
  accessToken: string
): Promise<string[]> {
  const endpoint = await resolveUserinfoEndpoint(issuerBaseURL);
  if (!endpoint) return [];
  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`userinfo request returned ${res.status}; treating groups as empty.`);
      return [];
    }
    return resolveUserGroups(await res.json());
  } catch (err) {
    console.warn('userinfo request failed; treating groups as empty:', err);
    return [];
  }
}

// ─── The express-openid-connect configuration ───────────────────────────────

/**
 * Build the auth() configuration from validated settings.
 *
 * `store` is the Redis-backed session store. `authRequired` is deliberately
 * FALSE: with it on, express-openid-connect answers every unauthenticated
 * request -- including an XHR to /api/hosts -- with a 302 to the provider, which
 * a browser fetch() cannot follow across origins, so an expired session surfaces
 * as an opaque network error instead of something the interface can act on.
 * index.ts gates /api/* explicitly (401 + a sign-in URL) and requires
 * authentication on the page routes, which is the same protection with a usable
 * failure mode.
 */
export function buildAuthConfig(settings: SsoSettings, store: unknown): ConfigParams {
  const config: ConfigParams = {
    issuerBaseURL: settings.issuerBaseURL,
    baseURL: settings.baseURL,
    clientID: settings.clientID,
    clientSecret: settings.clientSecret,
    secret: settings.secret,
    clientAuthMethod: 'client_secret_post',
    idpLogout: true,
    authRequired: false,
    // Pin the expected ID token algorithm. RS256 is what Okta, Entra ID and
    // Keycloak issue; pinning it means a token signed with anything else
    // (including a downgrade to a symmetric algorithm) is rejected outright.
    idTokenSigningAlg: 'RS256',
    // Opt-in: the provider must advertise pushed_authorization_request_endpoint
    // in its discovery document, and startup fails if it does not. When
    // available it keeps authorization parameters off the browser's URL bar
    // entirely, so they cannot be tampered with or logged by an intermediary.
    pushedAuthorizationRequests: settings.pushedAuthorizationRequests,
    backchannelLogout: settings.backchannelLogout,
    authorizationParams: {
      // Authorization Code flow. No token ever reaches the browser, and
      // express-openid-connect adds PKCE (S256) automatically for this
      // response_type, so an intercepted code cannot be redeemed by anyone else.
      response_type: 'code',
      scope: settings.scope,
    },
    session: {
      // A named cookie, so it cannot collide with another application on a
      // shared parent domain and does not advertise the library in use. The name
      // is shared with accessControl (which reads the session) and
      // security.middleware (which detects the cookie) so they cannot drift.
      name: SESSION_NAME,
      store: store as any,
      // Signed session ids. Without this the cookie carries a bare store key,
      // and session hijacking reduces to guessing it. The library warns that
      // signing becomes mandatory in its next major version.
      signSessionStoreCookie: true,
      requireSignedSessionStoreCookie: true,
      // Idle timeout: a session left open on an unattended workstation expires.
      rolling: true,
      rollingDuration: settings.idleSeconds,
      // Hard ceiling regardless of activity, so a stolen session cannot be kept
      // alive indefinitely by touching the site.
      absoluteDuration: settings.absoluteSeconds,
      cookie: {
        // Lax, not Strict: the provider returns the user by a cross-site
        // top-level GET, and Strict would withhold the cookie on exactly that
        // navigation, breaking the callback. Lax still withholds it from
        // cross-site POSTs, which is the CSRF-relevant case.
        sameSite: 'Lax',
        secure: true,
        httpOnly: true,
        domain: settings.cookieDomain,
      },
    },
    /**
     * Authorization at the moment of login.
     *
     * Reaching here means the provider authenticated the user and the ID token
     * verified. That says who they are, not that they may use this deployment --
     * in a large tenant every employee can reach the sign-in page. Checking the
     * group mapping now means an unentitled user gets one clear message instead
     * of an interface that loads and then denies every action.
     */
    afterCallback: async (_req, _res, session) => {
      const s = session as { id_token?: string; access_token?: string };
      const claims = s.id_token ? decodeJwtPayload(s.id_token) : null;
      const subject =
        (claims?.sub as string) || (claims?.email as string) || 'unknown-subject';

      let groups = resolveUserGroups(claims);
      let groupSource = 'id_token';

      // No groups in the token: the claim may be released only from userinfo.
      if (groups.length === 0 && s.access_token) {
        groups = await fetchGroupsFromUserinfo(settings.issuerBaseURL, s.access_token);
        groupSource = 'userinfo';
      }

      const level = getUserAccessLevel(groups);
      const mapping = permissionMappingStatus();

      console.log(
        `${AUTH_PREFIX} ${JSON.stringify({
          ts: new Date().toISOString(),
          event: 'login',
          actor: subject,
          groups: groups.length,
          group_source: groupSource,
          access_level: level,
          outcome: level === 'none' && settings.requireGroup ? 'denied' : 'allowed',
        })}`
      );

      if (level === 'none' && settings.requireGroup) {
        // The two causes need different fixes, so they get different messages.
        if (groups.length === 0) {
          throw new SsoAccessDeniedError(
            'Your identity provider released no group membership for this application. ' +
              'An administrator needs to add a groups claim to the application\'s ID token ' +
              '(see umich/QA/SSOwithOkta.md, "Release the groups claim"). ' +
              `No group claim was present in the ID token or the userinfo response for ${subject}.`
          );
        }
        throw new SsoAccessDeniedError(
          'Your account is not a member of any group permitted to use this application. ' +
            `Ask an administrator to add one of your groups to the permission mapping ` +
            `(${mapping.groups} group(s) are currently mapped).`
        );
      }

      // Carry the resolved list into the session. req.oidc.user is rebuilt from
      // the ID token's claims on every request, so where the groups came from
      // userinfo they exist ONLY here -- without this the user signs in
      // successfully and is then denied by every route, which looks like a broken
      // application rather than a provider configuration to fix.
      return { ...session, [SESSION_GROUPS_KEY]: groups };
    },
  };

  return config;
}

/**
 * A one-line startup summary of the effective posture. Written to the log so the
 * settings actually in force are recoverable from `docker compose logs` without
 * reading a root-owned env file.
 */
export function describeSsoPosture(settings: SsoSettings): string {
  const mapping = permissionMappingStatus();
  return [
    `SSO enabled: issuer=${settings.issuerBaseURL}`,
    `baseURL=${settings.baseURL}`,
    `scope="${settings.scope}"`,
    `session=${settings.absoluteSeconds}s absolute/${settings.idleSeconds}s idle`,
    `cookie=${settings.cookieDomain ? `domain ${settings.cookieDomain}` : 'host-only'}`,
    `groups mapped=${mapping.groups} (write: ${mapping.writeGroups})`,
    `require-group=${settings.requireGroup}`,
    `PAR=${settings.pushedAuthorizationRequests}`,
    `backchannel-logout=${settings.backchannelLogout}`,
  ].join(', ');
}
