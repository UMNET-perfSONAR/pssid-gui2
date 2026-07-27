// Request-level security controls that sit in front of every route.
//
// Each one is defence in depth: none is the only thing preventing the attack it
// addresses, and each closes a gap the others leave.

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { isSsoEnabled, SESSION_NAME } from '../shared/accessControl';

/** Methods that change server state. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value: string): string | null {
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The origins that count as "this deployment", for a same-origin comparison.
 *
 * BOTH the configured BASE_URL and the origin the request was actually addressed
 * to. Comparing against BASE_URL alone is wrong, not merely strict: nginx also
 * serves this application on `localhost` (install.sh's health poll, the Ansible
 * role and the troubleshooting docs all depend on that), so an operator working
 * in a browser on the VM itself sends `Origin: https://localhost` and would have
 * had every write refused.
 *
 * Accepting the request's own origin costs nothing in protection. CSRF is about
 * whether a request came from THIS site or somebody else's, and an attacker's
 * page sends its own origin, which matches neither entry. Reconstructing it is
 * safe because `trust proxy` is 1 and nginx sets Host and X-Forwarded-Proto
 * itself -- and nginx refuses a Host it does not serve before Express sees it.
 */
function acceptableOrigins(req: Request): Set<string> {
  const origins = new Set<string>();
  const configured = originOf((process.env.BASE_URL ?? '').trim());
  if (configured) origins.add(configured);
  const host = req.get('host');
  if (host) {
    const self = originOf(`${req.protocol}://${host}`);
    if (self) origins.add(self);
  }
  return origins;
}

/**
 * CSRF defence.
 *
 * The session cookie is SameSite=Lax, which already stops a browser from
 * attaching it to a cross-site POST, so this is a second, independent barrier
 * rather than the primary one -- worth having because SameSite is enforced by the
 * client, and a browser that mishandles it (or a user on one that predates it)
 * would otherwise be defenceless.
 *
 * The rule, for state-changing methods only:
 *
 *   * An Origin or Referer that does not match this deployment is refused. A
 *     browser sends Origin on every cross-origin request, so this is what
 *     actually blocks a forged form post from another site.
 *   * A cookie-authenticated request with NEITHER header is refused. Ambient
 *     credentials plus no provenance is the shape of the attack; a browser
 *     always sends at least one.
 *   * A request with no cookie and no Origin is allowed through to the
 *     authorization layer. That is a script or a curl call, which cannot be
 *     tricked into acting on someone else's behalf, and the deployment's own
 *     smoke suite is exactly this shape.
 */
export function enforceSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method.toUpperCase())) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');

  const claimed = origin && origin !== 'null' ? originOf(origin) : referer ? originOf(referer) : null;

  if (claimed !== null) {
    if (!acceptableOrigins(req).has(claimed)) {
      return void res.status(403).json({
        message: 'Cross-origin request refused',
      });
    }
    return next();
  }

  // Neither header. Only a problem if the request carries ambient credentials.
  // SESSION_NAME rather than a literal: if the cookie is ever renamed, a stale
  // literal here would silently stop recognising authenticated requests and this
  // guard would wave them all through.
  const hasSessionCookie = new RegExp(`(^|;\\s*)${SESSION_NAME}=`).test(req.get('cookie') ?? '');
  if (hasSessionCookie) {
    return void res.status(403).json({
      message: 'Request refused: a state-changing request from a signed-in session must carry an Origin or Referer header',
    });
  }

  return next();
}

/**
 * Keep API responses out of every cache.
 *
 * Responses here carry the deployment's configuration and, from /api/userinfo,
 * the caller's identity. A shared forward proxy or a browser's back/forward
 * cache holding those means one user's data can be served to the next -- so this
 * is set on every API response rather than per route, which is the version that
 * cannot be forgotten when a route is added.
 */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

/**
 * With SSO on, answer unauthenticated API requests with 401 JSON.
 *
 * express-openid-connect's own `authRequired` would answer with a 302 to the
 * provider. For a page load that is right; for the XHR the interface actually
 * makes it is useless -- fetch() cannot follow a redirect to another origin with
 * credentials, so an expired session arrives at the browser as an opaque network
 * failure. A 401 carrying the sign-in URL is something the client can act on,
 * and it is what user.store.ts uses to send the user to the provider.
 *
 * This is a usability layer over the real control, not the control itself: every
 * route independently calls authorize(), which denies on the same condition.
 */
export function requireApiAuthentication(req: Request, res: Response, next: NextFunction): void {
  if (!isSsoEnabled()) return next();

  const oidc = (req as any).oidc;
  if (oidc?.isAuthenticated?.()) return next();

  // A bare /login, with no returnTo parameter.
  //
  // This used to append `?returnTo=<the requested path>`, which was a promise the
  // stack does not keep: express-openid-connect's built-in login route calls
  // res.oidc.login({ returnTo: config.baseURL }) with the base URL hard-coded and
  // never reads a query parameter. Sign-in always returns the user to the
  // dashboard. Emitting the parameter anyway suggested otherwise to anyone
  // reading the response, and invited someone to "fix" the redirect by feeding
  // that value somewhere it WOULD be honoured -- which is how an open redirect
  // gets built. Advertising only what actually happens is the safer contract.
  res.status(401).json({
    error: 'Not authenticated',
    // `message` as well as `error`, and phrased for a person: the data stores read
    // `message` when they turn a failed request into a toast, so without this a
    // session that expires mid-edit surfaces as a bare "failed to save" with no
    // hint that signing in again is the remedy. user.store.ts redirects on a 401
    // it makes itself, but a 401 arriving on someone else's save has to explain
    // itself on the spot.
    message: 'Your session has expired. Reload the page to sign in again.',
    login_url: '/login',
  });
}

// ─── Rate limits ────────────────────────────────────────────────────────────
//
// Tiered on purpose. A single global bucket has to be set loose enough for the
// noisiest legitimate caller, which leaves it far too loose for the endpoints
// that matter. Every limit is overridable so an operator whose deployment is
// busier than this can raise it without a rebuild.

function limitFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const limiterDefaults = {
  windowMs: 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
};

/** Everything under /api: generous, a browsing user hits many read endpoints. */
export const apiLimiter = rateLimit({
  ...limiterDefaults,
  limit: limitFromEnv('RATE_LIMIT_API_PER_MIN', 200),
  message: { message: 'Too many requests, please try again later.' },
});

/**
 * State-changing API requests. Writes are human-paced in this interface -- a
 * form submit at a time -- so a much tighter bucket still never inconveniences a
 * real operator, while a scripted attempt to enumerate or churn objects is
 * stopped well before the global limit would notice.
 */
export const writeLimiter = rateLimit({
  ...limiterDefaults,
  limit: limitFromEnv('RATE_LIMIT_WRITE_PER_MIN', 120),
  // Reads are metered by apiLimiter; counting them here would just duplicate it.
  skip: (req) => !MUTATING.has(req.method.toUpperCase()),
  message: { message: 'Too many write requests, please try again later.' },
});

/**
 * The sign-in routes.
 *
 * Deliberately not tight. These share an IP for everyone behind one corporate
 * egress address, so a strict limit locks out a whole site at nine in the
 * morning -- an availability failure worse than the flooding it prevents. The
 * ceiling here exists to stop a redirect loop or a script from turning this
 * deployment into a battering ram against the identity provider, and nginx's
 * own limit_req sits in front of it for volumetric abuse. /callback is
 * deliberately not limited: it is already bound to a single-use state, nonce and
 * PKCE verifier, and a user retrying a failed sign-in must not be locked out.
 */
export const authLimiter = rateLimit({
  ...limiterDefaults,
  limit: limitFromEnv('RATE_LIMIT_LOGIN_PER_MIN', 60),
  message: { message: 'Too many sign-in attempts, please try again in a minute.' },
});
