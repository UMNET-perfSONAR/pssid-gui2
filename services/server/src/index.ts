// process.env.DEBUG = 'openid-client,express-openid-connect:*';

import express, { Express, Request, Response, NextFunction } from 'express';
import { connectToMongoDB, ensureIndexes } from './services/database.service';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { auth } from 'express-openid-connect';
import { requiresAuth } from 'express-openid-connect';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';

import config from './shared/config'; // shared/config will appear in docker container
import { isSsoEnabled } from './shared/accessControl';
import { auditLog } from './services/audit.service';
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

// either use authentication or proceed with application
function useAuth () {
  return ENABLE_SSO ? requiresAuth() : (_req: Request, _res: Response, next: Function) => next();
}

// The stack runs behind a single nginx reverse proxy, so trust exactly one hop.
// This lets Express read the real client protocol/IP from X-Forwarded-* (needed
// for secure cookies and correct rate-limit keys) without the blanket `true`,
// which would let clients spoof X-Forwarded-For to bypass IP rate limiting
// (express-rate-limit ERR_ERL_PERMISSIVE_TRUST_PROXY).
app.set('trust proxy', 1);
// Security headers (HSTS, X-Content-Type-Options, frameguard, etc.). CSP is left
// to nginx and disabled here so the SPA's assets aren't blocked; CORP is disabled
// so it doesn't interfere with the existing CORS/SSO configuration below.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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

// Rate limiting: 200 requests per minute per IP across all /api routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Health check, used by Docker and monitoring to verify the server + DB are
// reachable. Registered HERE, deliberately ahead of the OIDC middleware below:
// `auth({ authRequired: true })` protects every route registered after it, so
// with SSO on this would answer 302-to-the-IdP instead of 200. That breaks the
// container healthcheck (docker-compose.yml), which fails the server, which
// stops nginx starting via `depends_on: service_healthy`, which fails the
// Ansible health wait. It exposes no data — liveness only — so it stays public.
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const client = await connectToMongoDB();
    await client.db('admin').command({ ping: 1 });
    res.json({ status: 'ok', mongo: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', mongo: 'disconnected' });
  }
});

// create a redis database to store user sessions (prevents sessions from being deleted after redirect)
const redisClient = createClient({ url: process.env.REDIS_URL });
const store = new RedisStore({
  client: redisClient,
  ttl: 3600
});

if (ENABLE_SSO) {
  app.use(
    auth({
      issuerBaseURL: process.env.ISSUER_BASE_URL,
      baseURL: process.env.BASE_URL,
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      secret: process.env.SECRET,
      clientAuthMethod:'client_secret_post',
      idpLogout: true,
      authRequired: true,
      authorizationParams: {
        response_type: 'code',
        // 'groups' is the standard OIDC group claim; 'edumember' is the
        // eduPerson equivalent that federated higher-education identity
        // providers issue instead. Requesting both ensures group membership
        // arrives regardless of which claim the provider returns
        // (edumember_is_member_of or groups); accessControl.ts and
        // userinfo.routes.ts handle both transparently.
        scope: 'openid profile email edumember groups',
      },
      // OIDC flow will create a session for the user
      session: {
        absoluteDuration: 7200,
        store: store as any,
        cookie: {
          sameSite: 'Lax',
          secure: true,
          httpOnly: true,
          domain: process.env.COOKIE_DOMAIN,
        },
      },
    })
  );
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

// Audit trail. Mounted here deliberately: after the OIDC middleware above, so
// the acting identity is resolvable, and before every API route, so no
// state-changing request and no denial can bypass it by being added later.
app.use('/api/', auditLog);

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

// force login on '/', to enable SSO by default, either set ENABLE_SSO to true or use the requireAuth() function in place of useAuth()
// need to make a request to IdP, so async await is needed
app.get('/', useAuth(), async (req: Request, res: Response) => {
  if (ENABLE_SSO) {
    const userInfo = await req.oidc.fetchUserInfo();
  }
  res.redirect((process.env.BASE_URL || '') + '/dashboard');
});

// Unknown API routes return a clean JSON 404 (never an HTML/stack response).
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' });
});

// Central error handler, must be last. Turns malformed JSON bodies into a 400
// and any other unexpected error into a generic 500, never leaking internals
// (stack traces) to the client.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  console.error('Unhandled request error:', err);
  res.status(500).json({ message: 'Server error' });
});

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
    });
  })
  .catch((error: Error) => {
    console.error("Database connection failed", error)
    process.exit()
  });
