// process.env.DEBUG = 'openid-client,express-openid-connect:*';

import https from 'https';
import fs from 'fs';
import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from './services/database.service';
import { auth } from 'express-openid-connect';
import { requiresAuth } from 'express-openid-connect';
import { startup } from './setup/setupdb';
import { create_config_file } from './services/config.service';
import dotenv from 'dotenv';
dotenv.config();
var bodyParser = require('body-parser');
const app: Express = express();
const port = 8000;

const httpsOptions = {
  key: fs.readFileSync('/usr/src/app/server/pssid-web-dev.miserver.it.umich.edu-key.pem'),
  cert: fs.readFileSync('/usr/src/app/server/pssid-web-dev.miserver.it.umich.edu.pem'),
};

app.set('trust proxy', true);

// TODO - 
const cors = require('cors');
app.use(cors({
  origin: 'https://pssid-web-dev.miserver.it.umich.edu:8080',
  credentials: true
}))

app.use(
  auth({
    issuerBaseURL: process.env.ISSUER_BASE_URL,
    baseURL: process.env.BASE_URL,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    secret: process.env.SECRET,
    clientAuthMethod:'client_secret_post',
    idpLogout: true,
    authRequired: false,
    auth0Logout: true,
    authorizationParams: {
      response_type: 'code',
      scope: 'openid profile email edumember_ismemberof groups ismemberof edumember',
    },
    session: {
      cookie: {
        sameSite: 'None',
        secure: true
      }
    },
  })
);

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

// force login on '/'
app.get('/', requiresAuth(), (req: Request, res: Response) => {
  // console.log("Hello:", req.oidc.user);
  // console.log("------");
  // const idToken = req.oidc.idToken;
  // if (idToken) {
  //   const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
  //   console.log(payload);
  // }

  res.redirect('https://pssid-web-dev.miserver.it.umich.edu:8080/hosts');
});

// first connect to MongoDB(), then communicate with the web app
connectToMongoDB()
  .then(() => {
    https.createServer(httpsOptions, app).listen(port, () => {
      console.log('HTTPS server running at https://pssid-web-dev.miserver.it.umich.edu:8000');
    });
  })
  .catch((error: Error) => {
    console.error("Database connection failed", error)
    process.exit()
  });
