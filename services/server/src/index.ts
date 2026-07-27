import express, { Express, Request, Response, NextFunction } from 'express';
import { connectToMongoDB, ensureIndexes } from './services/database.service';
import cors from 'cors';
import helmet from 'helmet';

import { auth, requiresAuth } from 'express-openid-connect';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';

import {
  isSsoEnabled,
  isOpenWrite,
  validatePermissionMapping,
  permissionMappingStatus,
} from './shared/accessControl'; // shared/* appears in the docker container
import { auditLog } from './services/audit.service';
import {
  resolveSsoSettings,
  buildAuthConfig,
  describeSsoPosture,
  SsoAccessDeniedError,
  SsoConfigError,
  type SsoSettings,
} from './services/oidc.service';
import {
  enforceSameOrigin,
  noStore,
  requireApiAuthentication,
  apiLimiter,
  writeLimiter,
  authLimiter,
} from './services/security.middleware';
import dotenv from 'dotenv';

dotenv.config();
var bodyParser = require('body-parser');
const app: Express = express();
// Defaults to 8000 (the container's published port); overridable via PORT for
// local runs where 8000 is already taken.
const port = Number(process.env.PORT) || 8000;

// Process-level safety nets: keep a long-running unattended server alive instead
// of letting a single stray async error tear down all in-flight connections. The
// container healthcheck + restart policy remain the backstop for a wedged process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Resolved in accessControl so the middleware and the routes below can never
// disagree about whether SSO is on (env override, else the compiled default).
// Read once here, after dotenv.config() above has populated process.env.
const ENABLE_SSO = isSsoEnabled();

// ─── Fail closed before the first request ────────────────────────────────────
//
// Every check below has a failure mode that is worse than not starting: an
// unreadable group mapping denies every user, a wrong COOKIE_DOMAIN loops
// sign-in forever, a missing SECRET signs sessions with nothing. Each of those
// looks like a working deployment from the outside, which is how a security
// control ends up switched off without anyone noticing. Refusing to boot, with a
// message that names the setting, is the only outcome that cannot be missed.
function refuseToStart(reason: string): never {
  console.error('\n  REFUSING TO START\n');
  console.error(`  ${reason}\n`);
  console.error('  See docs/deployment.md#single-sign-on, or umich/QA/SSOwithOkta.md for');
  console.error('  the provider-side steps. Fix the setting and restart.\n');
  process.exit(1);
}

const mappingProblem = validatePermissionMapping();
if (mappingProblem) refuseToStart(mappingProblem);

let ssoSettings: SsoSettings | null = null;
if (ENABLE_SSO) {
  try {
    ssoSettings = resolveSsoSettings();
  } catch (err) {
    if (err instanceof SsoConfigError) refuseToStart(err.message);
    throw err;
  }
}

// The stack runs behind a single nginx reverse proxy, so trust exactly one hop.
// This lets Express read the real client protocol/IP from X-Forwarded-* (needed
// for secure cookies and correct rate-limit keys) without the blanket `true`,
// which would let clients spoof X-Forwarded-For to bypass IP rate limiting
// (express-rate-limit ERR_ERL_PERMISSIVE_TRUST_PROXY).
app.set('trust proxy', 1);
// Belt and braces: helmet already removes this, but the header leaks the stack
// in use and there is no reason for any code path to reinstate it.
app.disable('x-powered-by');

// Security headers (X-Content-Type-Options, frameguard, etc.). CSP is left to
// nginx (see nginx.conf) and disabled here so the SPA's assets aren't blocked;
// CORP is disabled so it doesn't interfere with the CORS/SSO configuration below.
//
// HSTS is opt-in through the environment, and off by default, because it is
// genuinely harmful on the self-signed certificate the installer generates by
// default: HSTS makes a certificate error NON-BYPASSABLE, so a browser that has
// seen the header stops offering "Advanced -> Proceed" and every user is locked
// out for the whole max-age with no server-side way to take it back. install.sh
// sets HSTS_ENABLED=true only for the Let's Encrypt (CA-issued) TLS mode, the
// same rule it applies to the nginx-level header.
const hstsEnabled = /^(1|true|yes|on)$/i.test((process.env.HSTS_ENABLED ?? '').trim());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: hstsEnabled ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
  // These two are set BECAUSE nginx sets them, and they are set to the SAME
  // values. nginx's add_header appends to whatever the upstream sent, so with
  // helmet's defaults every /api/ response carried two conflicting values of
  // each: X-Frame-Options SAMEORIGIN (helmet) alongside DENY (nginx), and
  // Referrer-Policy no-referrer alongside strict-origin-when-cross-origin.
  // A duplicated X-Frame-Options with conflicting values is not merely untidy --
  // browsers disagree about how to resolve it, and some discard the header
  // entirely, which turns two framing protections into none. nginx additionally
  // hides the upstream copies (proxy_hide_header) so exactly one of each is sent;
  // matching the values here means the policy is still correct for anyone who
  // reaches the server directly, bypassing nginx, as a port-forward for
  // debugging does.
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Explicit body size ceilings. The default is already 100kb, but stating it here
// means a future change of body parser cannot silently make this unbounded, and
// every request body this API legitimately accepts (a form's worth of JSON) is
// orders of magnitude smaller. Oversized bodies are rejected before they are
// parsed, so a large payload costs no CPU.
const BODY_LIMIT = (process.env.BODY_LIMIT ?? '256kb').trim();
app.use(bodyParser.json({ limit: BODY_LIMIT }));
app.use(bodyParser.urlencoded({ extended: true, limit: BODY_LIMIT }));
// The SPA is served from this same origin (nginx serves the bundle and proxies
// /api/ on one hostname), so cross-origin access is never needed in normal
// operation. `|| false` makes that explicit and FAILS CLOSED: passing an
// undefined origin makes the cors package emit `Access-Control-Allow-Origin: *`,
// which would let any website a signed-in user visits read this API from their
// browser. That is exactly what happened while services/server/.env was
// unreadable and BASE_URL came back undefined. With `false`, no CORS headers are
// sent and cross-origin reads are blocked; same-origin requests are unaffected.
app.use(cors({
  origin: process.env.BASE_URL || false,
  credentials: ENABLE_SSO
}));

// Rate limiting. The broad per-IP ceiling for everything under /api; the tighter
// write and sign-in buckets are mounted further down, next to what they protect.
app.use('/api/', apiLimiter);

// Health check, used by Docker and monitoring to verify the server + DB are
// reachable. Registered HERE, deliberately ahead of the OIDC and authentication
// middleware below: anything that requires a session would answer this with a
// 302 or a 401 instead of 200. That breaks the container healthcheck
// (docker-compose.yml), which fails the server, which stops nginx starting via
// `depends_on: service_healthy`, which fails the Ansible health wait. It exposes
// no data (liveness only), so it stays public.
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const client = await connectToMongoDB();
    await client.db('admin').command({ ping: 1 });
    res.json({ status: 'ok', mongo: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', mongo: 'disconnected' });
  }
});

// Session storage for the OIDC flow. Redis rather than a cookie: an ID token
// with a real groups claim does not fit in one, and a cookie-only session would
// also mean a server restart signs everybody out.
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.error('Redis client error:', err));

if (ENABLE_SSO && ssoSettings) {
  const store = new RedisStore({
    client: redisClient,
    // Match the session's absolute lifetime. A shorter TTL evicts live sessions
    // early and signs users out mid-task for no reason -- which is what the
    // previous fixed 3600 did to the 7200-second session it was paired with.
    ttl: ssoSettings.absoluteSeconds,
  });

  // The sign-in routes come from this middleware, so the limiter has to be
  // mounted ahead of it.
  app.use(['/login', '/logout'], authLimiter);
  app.use(auth(buildAuthConfig(ssoSettings, store)));
}

const hostroute=require("./routes/hosts.routes");
const jobroute=require("./routes/jobs.routes");
const scheduleroute=require("./routes/schedules.routes");
const hostgrouproute=require("./routes/hostgroups.routes");
const batchroute=require("./routes/batches.routes");
const ssidprofileroute=require("./routes/ssid_profiles.routers");
const testroute=require("./routes/tests.routes");
const userinforoute=require("./routes/userinfo.routes");
const layerscriptroute=require("./routes/layer_scripts.routes");
const provisionroute=require("./routes/provision.routes");
const settingsroute=require("./routes/settings.routes");

// Nothing under /api/ may be cached: responses carry this deployment's
// configuration and, from /api/userinfo, the caller's identity.
app.use('/api/', noStore);

// Audit trail. Mounted here deliberately: after the OIDC middleware above, so
// the acting identity is resolvable, and before every API route and every guard
// below, so no state-changing request and no denial -- including a refused
// cross-origin request or an unauthenticated call -- can escape the record.
app.use('/api/', auditLog);

// CSRF: refuse a state-changing request whose provenance is another origin.
app.use('/api/', enforceSameOrigin);

// Tighter per-IP ceiling on writes only (reads are metered by apiLimiter above).
app.use('/api/', writeLimiter);

// With SSO on, an unauthenticated API call gets a 401 carrying the sign-in URL
// rather than a redirect the browser's fetch() cannot follow. Each route still
// enforces its own access level through authorize(); this only makes the failure
// legible to the client. /api/health is registered above, so it stays public.
app.use('/api/', requireApiAuthentication);

// Auto-provision: successful writes to daemon-affecting routers (below) request
// a debounced provision when the operator has enabled it in Settings.
const { autoProvisionOnWrite } = require('./services/autoProvision.service');

app.use("/api/hosts", autoProvisionOnWrite, hostroute);
app.use("/api/jobs", autoProvisionOnWrite, jobroute);
app.use("/api/schedules", autoProvisionOnWrite, scheduleroute);
app.use("/api/host-groups", autoProvisionOnWrite, hostgrouproute);
app.use("/api/batches", autoProvisionOnWrite, batchroute);
app.use("/api/ssid-profiles", autoProvisionOnWrite, ssidprofileroute);
app.use("/api/tests", autoProvisionOnWrite, testroute);
app.use('/api/userinfo', userinforoute);
app.use('/api/layer-scripts', layerscriptroute);
app.use('/api/provision', provisionroute);
app.use('/api/settings', settingsroute);

// Root redirect to the dashboard. With SSO enabled this is a page navigation, so
// requiresAuth() is the right guard here: it sends an anonymous visitor to the
// identity provider, which is exactly what a browser should do with a top-level
// GET (and is why /api/* is gated separately, above, with a 401 instead).
app.get('/', ENABLE_SSO ? requiresAuth() : (_req: Request, _res: Response, next: NextFunction) => next(),
  (_req: Request, res: Response) => {
    res.redirect((process.env.BASE_URL || '') + '/dashboard');
  });

// Unknown API routes return a clean JSON 404 (never an HTML/stack response).
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' });
});

// Central error handler, must be last.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  // Request body larger than BODY_LIMIT.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large' });
  }

  // A successful authentication by a user this deployment does not permit. This
  // arrives on the OIDC callback -- a browser navigation -- so an HTML page is
  // what the person actually sees. It is not a server fault and must not be
  // reported as one: the cause is a group mapping or a provider claim, and the
  // message says which, because the alternative is a support ticket that reads
  // "it says 500".
  if (err instanceof SsoAccessDeniedError) {
    console.warn(`SSO access denied: ${err.message}`);
    if (req.accepts('html')) {
      return res.status(403).type('html').send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Access denied</title><style>` +
        `body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
        `margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f8fa;color:#1e293b}` +
        `main{max-width:34rem;padding:2rem;background:#fff;border:1px solid #e2e8f0;border-radius:12px;` +
        `box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-size:1.35rem;margin:0 0 .75rem}` +
        `p{margin:0 0 1rem}a{color:#0369a1}</style></head><body><main>` +
        `<h1>Access denied</h1><p>${escapeHtml(err.message)}</p>` +
        `<p><a href="/logout">Sign out</a></p></main></body></html>`
      );
    }
    return res.status(403).json({ error: err.message });
  }

  console.error('Unhandled request error:', err);
  res.status(500).json({ message: 'Server error' });
});

/** Minimal HTML escaping for the one place a message is rendered into markup. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

// first connect to MongoDB(), then communicate with the web app
connectToMongoDB()
  .then(async () => {
    console.log("MongoDB connected.");
    await ensureIndexes();
    if (ENABLE_SSO) {
      console.log("Connecting to Redis...");
      return redisClient.connect();
    }
  })
  .then(() => {
    app.listen(port, () => {
      console.log(`HTTP server running at http://localhost:${port}`);
      // The posture actually in force, recoverable from `docker compose logs`
      // without reading a root-owned env file.
      if (ENABLE_SSO && ssoSettings) {
        console.log(describeSsoPosture(ssoSettings));
      } else {
        // isOpenWrite(), not config.OPEN_WRITE: the environment OVERRIDES the
        // compiled default, so combining the two would misreport the posture
        // whenever they disagree -- exactly the case worth logging accurately.
        const { groups } = permissionMappingStatus();
        console.log(
          `SSO disabled: writes are ${isOpenWrite() ? 'OPEN to unauthenticated callers' : 'refused (read-only)'}` +
          `; ${groups} group mapping(s) loaded but unused in this posture.`
        );
      }
    });
  })
  .catch((error: Error) => {
    console.error("Database connection failed", error)
    process.exit()
  });
