// Authorization: the single place that decides what an identity may do.
//
// Server-side only. This module reads the filesystem and the environment and is
// deliberately excluded from the client type-check (services/client/tsconfig*.json)
// -- the browser is never the authority on access, it only renders what the
// server reports through /api/userinfo.
//
// Two postures, resolved per request so a prebuilt image can be reconfigured by
// environment variable without a rebuild:
//
//   SSO on   Identity comes from the OIDC provider. Group membership is mapped
//            to read/write by auth-groups.config.json. No mapped group means no
//            access at all -- the mapping is an allowlist, never a denylist.
//   SSO off  There is no identity. Reads are open and OPEN_WRITE decides whether
//            writes are too. This posture is for a site that is access-controlled
//            by other means (a private network, an authenticating proxy).
//
// Everything here fails CLOSED: an unreadable or malformed mapping file grants
// nothing, and index.ts refuses to start rather than serving an SSO deployment
// whose mapping could not be loaded.

import fs from 'fs';
import path from 'path';
import config from './config';
import { Request, Response, NextFunction } from 'express';

export type AccessLevel = 'none' | 'read' | 'write';

const accessPriority: Record<AccessLevel, number> = { none: 0, read: 1, write: 2 };

/**
 * Read a boolean from the environment, falling back to the compiled default in
 * config.ts when the variable is unset or empty.
 *
 * The auth posture is compiled into the bundle/build, so without this a
 * prebuilt image (install.sh --pull) could not be switched between open and
 * read-only without rebuilding. Server-side only: this module is never bundled
 * into the browser client.
 */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

// Resolved lazily, not at module load: index.ts calls dotenv.config() in its
// module body, which runs AFTER this module's imports are evaluated. Reading
// the environment on each call means a value from services/server/.env is
// honored just as a real environment variable from compose is.

/** Effective write policy when SSO is disabled. */
export const isOpenWrite = (): boolean => envBool('OPEN_WRITE', config.OPEN_WRITE);
/** Effective SSO switch. */
export const isSsoEnabled = (): boolean => envBool('ENABLE_SSO', config.ENABLE_SSO);

// ─── The group -> permission mapping ────────────────────────────────────────

/**
 * Where the mapping lives.
 *
 * AUTH_GROUPS_FILE, when set, is the ONLY candidate -- it does NOT sit in front of
 * the built-in paths as a preference. That distinction is the whole point: an
 * operator who points this at a path that turns out to be wrong (a typo, a mount
 * that did not land) must get a hard failure, not a quiet fallback to the mapping
 * that happens to be baked into the image. The shipped example maps `pssid-gui` to
 * write, so falling back would grant write access through a group the operator
 * never configured and would never think to look for.
 *
 * With it unset: the compiled server runs from build/shared/, and
 * docker-compose.yml bind-mounts the operator's file over src/shared/, so the
 * first path is the real one in production and under vitest alike. The second is
 * a fallback for a layout where the JSON sits beside this module.
 *
 * Resolved per call rather than captured once, because index.ts calls
 * dotenv.config() after this module is imported.
 */
function candidatePaths(): string[] {
  const override = (process.env.AUTH_GROUPS_FILE ?? '').trim();
  if (override !== '') return [path.resolve(override)];
  return [
    path.resolve(__dirname, '../../src/shared/auth-groups.config.json'),
    path.resolve(__dirname, './auth-groups.config.json'),
  ];
}

/** Normalized mapping: lower-cased group name -> level. */
type PermissionMap = Map<string, AccessLevel>;

interface LoadedMapping {
  map: PermissionMap;
  /** Non-null when the file could not be read or was malformed. */
  error: string | null;
  /** Absolute path the mapping was loaded from, for diagnostics. */
  source: string | null;
}

/**
 * Accept the documented levels plus the two shapes older deployments wrote by
 * hand: a bare boolean and the strings "true"/"false" (the first version of this
 * file used `"group": true` to mean write). Anything else is a typo the operator
 * needs to hear about, not something to guess at.
 */
function normalizeLevel(raw: unknown): AccessLevel | null {
  if (raw === true) return 'write';
  if (raw === false) return 'none';
  if (typeof raw !== 'string') return null;
  switch (raw.trim().toLowerCase()) {
    case 'write':
    case 'true':
      return 'write';
    case 'read':
      return 'read';
    case 'none':
    case 'false':
      return 'none';
    default:
      return null;
  }
}

function loadMapping(): LoadedMapping {
  const tried: string[] = [];
  for (const candidate of candidatePaths()) {
    tried.push(candidate);
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      const permissions = parsed?.permissions;
      if (permissions === null || typeof permissions !== 'object' || Array.isArray(permissions)) {
        return {
          map: new Map(),
          error: `${candidate}: expected a top-level "permissions" object`,
          source: candidate,
        };
      }
      const map: PermissionMap = new Map();
      const rejected: string[] = [];
      for (const [group, value] of Object.entries(permissions)) {
        const level = normalizeLevel(value);
        if (level === null) {
          rejected.push(`${group}=${JSON.stringify(value)}`);
          continue;
        }
        // Case-insensitive: identity providers are inconsistent about the case
        // of directory group names, and an operator transcribing "PSSID-GUI"
        // from an Okta console should not silently end up with no access.
        map.set(group.trim().toLowerCase(), level);
      }
      if (rejected.length > 0) {
        return {
          map: new Map(),
          error:
            `${candidate}: unrecognized permission level(s): ${rejected.join(', ')}. ` +
            `Use "read", "write" or "none".`,
          source: candidate,
        };
      }
      return { map, error: null, source: candidate };
    } catch (err) {
      return {
        map: new Map(),
        error: `${candidate}: ${err instanceof Error ? err.message : String(err)}`,
        source: candidate,
      };
    }
  }
  return {
    map: new Map(),
    error: `auth-groups.config.json not found (looked in: ${tried.join(', ')})`,
    source: null,
  };
}

// Cached, with the file's mtime as the cache key, so an edit to the mapping takes
// effect on a running server without a restart. statSync is cheap, but it is
// still a syscall per authorization check, so it is throttled to one per second.
// STAT_INTERVAL_MS is 0 under test so a fixture written mid-test is seen at once.
//
// CAVEAT, for the containerised deployment: docker-compose.yml bind-mounts this
// as a SINGLE FILE, and such a mount follows the inode, not the path. An editor
// that writes a temporary file and renames it over the original -- which is what
// `sed -i` and vim do by default -- leaves the container still reading the old
// inode, so the change is invisible however often this restats it. Editing in
// place (`cat > file`) is seen immediately; anything else needs
// `docker compose restart server`. The re-read is still worth having: it is what
// makes an in-place edit and an AUTH_GROUPS_FILE on a directory mount work
// without downtime.
const STAT_INTERVAL_MS = process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 1000;
let cached: LoadedMapping | null = null;
let cachedMtimeMs = -1;
let lastStatAt = 0;

function currentMapping(): LoadedMapping {
  const now = Date.now();
  if (cached !== null && STAT_INTERVAL_MS > 0 && now - lastStatAt < STAT_INTERVAL_MS) return cached;
  lastStatAt = now;

  let mtimeMs = -1;
  for (const candidate of candidatePaths()) {
    try {
      mtimeMs = fs.statSync(candidate).mtimeMs;
      break;
    } catch {
      // Try the next candidate; a missing file is reported by loadMapping().
    }
  }
  if (cached === null || mtimeMs !== cachedMtimeMs) {
    cached = loadMapping();
    cachedMtimeMs = mtimeMs;
    if (cached.error) console.error(`Permission mapping NOT loaded: ${cached.error}`);
  }
  return cached;
}

/**
 * The mapping as loaded, for diagnostics and startup validation. `error` is the
 * reason no group grants anything.
 */
export function permissionMappingStatus(): {
  error: string | null;
  source: string | null;
  groups: number;
  writeGroups: number;
} {
  const { map, error, source } = currentMapping();
  let writeGroups = 0;
  for (const level of map.values()) if (level === 'write') writeGroups++;
  return { error, source, groups: map.size, writeGroups };
}

/**
 * Startup gate. With SSO on, the mapping is the only thing standing between an
 * authenticated stranger and this deployment's data, so a deployment whose
 * mapping could not be loaded must not serve traffic: every request would be
 * denied anyway, and the cause would be one line in a log nobody reads.
 *
 * Returns an operator-facing error string, or null when everything is in order.
 * With SSO off the mapping is unused, so it is not required to be present.
 */
export function validatePermissionMapping(): string | null {
  if (!isSsoEnabled()) return null;
  const { error, groups, writeGroups } = permissionMappingStatus();
  if (error) return `SSO is enabled but the group permission mapping is unusable. ${error}`;
  if (groups === 0) {
    return (
      'SSO is enabled but the group permission mapping is empty, so every ' +
      'authenticated user would be denied. Add at least one group to ' +
      'shared/auth-groups.config.json.'
    );
  }
  if (writeGroups === 0) {
    // Not fatal: a deliberately read-only deployment is a legitimate choice.
    console.warn(
      'Permission mapping grants no group write access; this deployment is read-only.'
    );
  }
  return null;
}

// ─── Resolving groups from an OIDC identity ─────────────────────────────────

/**
 * Claims that carry group membership, in the order they are trusted. Providers
 * disagree: `groups` is what Okta and Entra ID emit once a groups claim is added
 * to the token, the two `edumember_*` spellings are the eduPerson attribute a
 * federated higher-education IdP releases instead, and `isMemberOf` is what a
 * Shibboleth/Grouper deployment sends. Reading all of them means the same build
 * works against any of these without a provider-specific branch.
 */
const GROUP_CLAIMS = [
  'groups',
  // BOTH spellings of the eduPerson attribute, deliberately. The attribute is
  // `isMemberOf` and providers disagree about how to snake_case it into a claim
  // name: some emit `edumember_is_member_of`, and Okta emits
  // `edumember_ismemberof` (no separators inside "ismemberof"). Matching is
  // exact, so carrying only one spelling means the other tenant authenticates
  // every user and then denies them all -- membership resolves to an empty list,
  // which maps to no permission. That is indistinguishable from "the provider
  // never released the claim", and it costs a round trip with the identity team
  // to find out otherwise.
  'edumember_ismemberof',
  'edumember_is_member_of',
  'isMemberOf',
] as const;

/**
 * The session cookie / request property name. Shared so oidc.service (which
 * names the cookie), security.middleware (which detects it) and this module
 * (which reads the session) cannot drift apart.
 */
export const SESSION_NAME = 'pssid_session';

/**
 * Key under which the groups resolved AT LOGIN are stored on the session.
 *
 * This exists because req.oidc.user is derived exclusively from the ID token's
 * claims -- express-openid-connect rebuilds it from idTokenClaims on every
 * request. A provider that releases group membership only from its userinfo
 * endpoint (in Okta, a claim scoped to "Userinfo / id_token request" rather than
 * "Always") therefore produces a token with no groups in it at all. The login
 * check in oidc.service fetches them from userinfo and correctly lets the user
 * in, and then every subsequent request would find no groups on the identity and
 * deny it: signing in appears to work and the whole application is 403. Stashing
 * the resolved list on the session is what makes the fallback actually usable.
 */
export const SESSION_GROUPS_KEY = 'pssid_groups';

/**
 * Extract the group list from an OIDC user object.
 *
 * Every claim above is merged rather than the first match winning: a tenant can
 * legitimately release more than one, and taking only the first would silently
 * drop the membership that grants access. Values arrive as an array of strings,
 * or -- from providers that flatten single values -- as one string.
 */
export function resolveUserGroups(user: unknown): string[] {
  if (user === null || typeof user !== 'object') return [];
  const claims = user as Record<string, unknown>;
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed === '') return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const claim of GROUP_CLAIMS) {
    const raw = claims[claim];
    if (Array.isArray(raw)) raw.forEach(add);
    else add(raw);
  }
  return out;
}

/**
 * The highest level any of these groups grants. Matching is exact (after
 * trimming and case-folding), never by prefix or suffix: a mapping entry is an
 * explicit grant, and matching `pssid-gui` against a claim value like
 * `urn:mace:example.edu:group:pssid-gui-readonly` would hand out write access
 * nobody configured. Operators paste the claim value exactly as the provider
 * emits it; SSOwithOkta.md shows how to read it off a real token.
 */
export function getUserAccessLevel(userGroups: string[]): AccessLevel {
  const { map } = currentMapping();
  let maxLevel: AccessLevel = 'none';
  for (const group of userGroups) {
    if (typeof group !== 'string') continue;
    const level = map.get(group.trim().toLowerCase());
    if (level && accessPriority[level] > accessPriority[maxLevel]) {
      maxLevel = level;
    }
  }
  return maxLevel;
}

/**
 * The groups for a request: the list resolved at login if one was stored, else
 * the ID token's own claims.
 *
 * The stored list wins because it is strictly better information -- it was built
 * from the ID token AND, where the token carried nothing, the provider's userinfo
 * response. Falling back to the claims keeps sessions created before this existed
 * working, and covers the ordinary case where the token has the groups anyway.
 */
export function resolveRequestGroups(req: Request): string[] {
  const stored = (req as any)?.[SESSION_NAME]?.[SESSION_GROUPS_KEY];
  if (Array.isArray(stored)) {
    const groups = stored.filter((g): g is string => typeof g === 'string');
    if (groups.length > 0) return groups;
  }
  return resolveUserGroups((req as any)?.oidc?.user);
}

/** The effective level for a request, whatever the posture. */
export function effectiveAccessLevel(req: Request): AccessLevel {
  if (!isSsoEnabled()) return isOpenWrite() ? 'write' : 'read';
  if (!(req as any).oidc?.user) return 'none';
  return getUserAccessLevel(resolveRequestGroups(req));
}

// ─── The middleware ─────────────────────────────────────────────────────────

/**
 * Gate a route on a minimum access level. Mount on every route: there is no
 * implicit-allow path, and routes/__tests__/authorization.coverage.test.ts fails
 * the build if a new endpoint is added without one.
 *
 * Status codes are distinguished on purpose. 401 means "no identity, signing in
 * may help" and is what lets the browser send the user to the provider; 403
 * means "this identity is not permitted", which no amount of re-authentication
 * will change. Returning 403 for both -- as this used to -- makes an expired
 * session indistinguishable from a missing group membership, for the user and
 * for whoever is reading the audit log.
 */
export function authorize(requiredLevel: 'read' | 'write') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isSsoEnabled()) {
      // When SSO disabled:
      if (requiredLevel === 'write' && !isOpenWrite()) {
        // Deny write requests if OPEN_WRITE is false
        return res.status(403).json({ error: 'Write access denied: SSO disabled and OPEN_WRITE false' });
      }
      // Allow read requests and write requests if OPEN_WRITE is true
      return next();
    }

    const oidc = (req as any).oidc;
    // No session: authenticating is the remedy, so say so with a 401 and point
    // at the sign-in route rather than a dead-end 403.
    if (!oidc?.isAuthenticated?.() || !oidc?.user) {
      // `message` as well as `error`: the client's stores read `message` when
      // turning a failed request into a toast, so a session that expires mid-edit
      // needs to say what to do about it rather than becoming a bare failure.
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Your session has expired. Reload the page to sign in again.',
        login_url: '/login',
      });
    }

    // resolveRequestGroups, not resolveUserGroups: a provider that releases
    // groups only from its userinfo endpoint puts none in the ID token, and the
    // list resolved at login is the only place they exist.
    const userLevel = getUserAccessLevel(resolveRequestGroups(req));

    if (accessPriority[userLevel] >= accessPriority[requiredLevel]) {
      return next();
    }

    // Deliberately does not echo the user's group list back: it is the caller's
    // own membership, but repeating it invites treating the error as a probe for
    // which group names exist. The audit line carries the identity, which is
    // what an operator needs to resolve a genuine access request.
    return res.status(403).json({
      error:
        userLevel === 'none'
          ? 'Access denied: your account is not a member of any group mapped to this application'
          : `Access denied: ${requiredLevel} access required`,
    });
  };
}
