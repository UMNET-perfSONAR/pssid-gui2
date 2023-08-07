"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_service_1 = require("./services/database.service");
var bodyParser = require('body-parser');
const app = (0, express_1.default)();
const port = 8000;
// TODO - 
const cors = require('cors');
app.use(cors({
    origin: '*'
}));
// call just once to initialize some data in db - will eliminate later. serves as a "reset" for now
// startup();
const hostroute = require("./routes/hosts.routes");
const jobroute = require("./routes/jobs.routes");
const scheduleroute = require("./routes/schedules.routes");
const hostgrouproute = require("./routes/hostgroups.routes");
const archiverroute = require("./routes/archivers.routes");
const batchroute = require("./routes/batches.routes");
const ssidprofileroute = require("./routes/ssid_profiles.routers");
const testroute = require("./routes/tests.routes");
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
// url that requests root route (specified by /) with GET method triggers function below 
app.get('/', (req, res) => {
    res.send('Express + TypeScript Server');
});
// first connect to MongoDB(), then communicate with the web app
(0, database_service_1.connectToMongoDB)()
    .then(() => {
    app.listen(port, () => {
        console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });
})
    .catch((error) => {
    console.error("Database connection failed", error);
    process.exit();
});
