process.env.DEBUG = 'openid-client,express-openid-connect:*';

import https from 'https';
import fs from 'fs';
import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from './services/database.service';
import { auth } from 'express-openid-connect';
import { requiresAuth } from 'express-openid-connect';
import { startup } from './setup/setupdb';
import { create_config_file } from './services/config.service';
import config from './shared/config';
import { authorize } from './shared/accessControl';
import dotenv from 'dotenv';
dotenv.config();
var bodyParser = require('body-parser');
const app: Express = express();
const port = 8000;

// NOTE: make sure to create certs on your local machine and create a certs folder (backend and frontend)
// const httpsOptions = {
//   key: fs.readFileSync('/usr/src/app/server/pssid-web-dev.miserver.it.umich.edu-key.pem'),
//   cert: fs.readFileSync('/usr/src/app/server/pssid-web-dev.miserver.it.umich.edu.pem'),
// };

const ENABLE_SSO = config.ENABLE_SSO;

// either use authentication or do nothing (so SSO is disabled)
function useAuth () {
  return ENABLE_SSO ? requiresAuth() : (_req: Request, _res: Response, next: Function) => next();
}

app.set('trust proxy', true);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// TODO - 
const cors = require('cors');
app.use(cors({
  origin: 'https://pssid-web-dev.miserver.it.umich.edu',
  credentials: ENABLE_SSO
}))

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
    auth0Logout: true,
    authorizationParams: {
      response_type: 'code',
        scope: 'openid profile email edumember',
        claims: JSON.stringify({
          id_token: {
            // force identity provider to include this claim in the ID token or reject auth if not present
            edumember_is_member_of: { essential: true },
          },
        }),
    },
    session: {
      rolling: true,
      cookie: {
        sameSite: 'None',
        secure: true,
        httpOnly: true,
      }
    },
  })
);
}

// call just once to initialize some data in db - will eliminate later. serves as a "reset" for now
// startup();

const hostroute=require("./routes/hosts.routes");
const jobroute=require("./routes/jobs.routes");
const scheduleroute=require("./routes/schedules.routes");
const hostgrouproute=require("./routes/hostgroups.routes");
const archiverroute=require("./routes/archivers.routes");
const batchroute=require("./routes/batches.routes");
const ssidprofileroute=require("./routes/ssid_profiles.routers");
const testroute=require("./routes/tests.routes");
const userinforoute=require("./routes/userinfo.routes");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/hosts", hostroute);
app.use("/jobs", jobroute);
app.use("/schedules", scheduleroute);
app.use("/host-groups", hostgrouproute);
app.use("/archivers", archiverroute);
app.use("/batches", batchroute); 
app.use("/ssid-profiles", ssidprofileroute);
app.use("/tests", testroute);
app.use('/api/userinfo', userinforoute);

// app.get('/test-cookie', (req, res) => {
//   res.cookie('test', '123', { sameSite: 'None', secure: false });
//   res.send('Cookie set');
// });


// force login on '/', to enable SSO by default, either set ENABLE_SSO to true or use the requireAuth() function in place of useAuth()
// need to make a request to IdP, so async await is needed
app.get('/', useAuth(), async (req: Request, res: Response) => {
  // fetches user info, specifically fetches the edumember_ismemberof

  if (ENABLE_SSO) {
    const userInfo = await req.oidc.fetchUserInfo();
    const groups: string[] = userInfo.edumember_is_member_of as string[];
    console.log(groups);
    console.log(req.oidc.user);
  }
  
  res.redirect('https://pssid-web-dev.miserver.it.umich.edu/hosts');
});

// first connect to MongoDB(), then communicate with the web app
connectToMongoDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`HTTP server running at http://localhost:${port}`);
    });
    // https.createServer(httpsOptions, app).listen(port, () => {
    //   console.log('HTTPS server running at https://pssid-web-dev.miserver.it.umich.edu:8000');
    // });
  })
  .catch((error: Error) => {
    console.error("Database connection failed", error)
    process.exit()
  });
