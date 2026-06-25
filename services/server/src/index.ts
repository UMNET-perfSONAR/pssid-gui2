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
import dotenv from 'dotenv';

dotenv.config();
var bodyParser = require('body-parser');
const app: Express = express();
const port = 8000;

// Process-level safety nets: keep a long-running unattended server alive instead
// of letting a single stray async error tear down all in-flight connections. The
// container healthcheck + restart policy remain the backstop for a wedged process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const ENABLE_SSO = config.ENABLE_SSO;

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
app.use(cors({
  origin: process.env.BASE_URL,
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
        // 'edumember' was required by UMich Weblogin; 'groups' is standard Okta.
        // Requesting both ensures group membership arrives regardless of which
        // claim UMich Okta returns (edumember_is_member_of or groups).
        // accessControl.ts and userinfo.routes.ts handle both transparently.
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
const archiverroute=require("./routes/archivers.routes");
const batchroute=require("./routes/batches.routes");
const ssidprofileroute=require("./routes/ssid_profiles.routers");
const testroute=require("./routes/tests.routes");
const userinforoute=require("./routes/userinfo.routes");
const layerscriptroute=require("./routes/layer_scripts.routes");
const provisionhistoryroute=require("./routes/provision_history.routes");
const provisionroute=require("./routes/provision.routes");
const settingsroute=require("./routes/settings.routes");

// Auto-provision: successful writes to daemon-affecting routers (below) request
// a debounced provision when the operator has enabled it in Settings.
const { autoProvisionOnWrite } = require('./services/autoProvision.service');

app.use("/api/hosts", autoProvisionOnWrite, hostroute);
app.use("/api/jobs", autoProvisionOnWrite, jobroute);
app.use("/api/schedules", autoProvisionOnWrite, scheduleroute);
app.use("/api/host-groups", autoProvisionOnWrite, hostgrouproute);
app.use("/api/archivers", archiverroute);
app.use("/api/batches", autoProvisionOnWrite, batchroute);
app.use("/api/ssid-profiles", autoProvisionOnWrite, ssidprofileroute);
app.use("/api/tests", autoProvisionOnWrite, testroute);
app.use('/api/userinfo', userinforoute);
app.use('/api/layer-scripts', layerscriptroute);
app.use('/api/provision-history', provisionhistoryroute);
app.use('/api/provision', provisionroute);
app.use('/api/settings', settingsroute);

// Health check, used by Docker and monitoring to verify the server + DB are reachable
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const client = await connectToMongoDB();
    await client.db('admin').command({ ping: 1 });
    res.json({ status: 'ok', mongo: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', mongo: 'disconnected' });
  }
});

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
