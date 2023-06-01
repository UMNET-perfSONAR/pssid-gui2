import express, { Express, Request, Response } from 'express';
//import cors from 'cors';
import { connectToMongoDB } from './services/ideas.service';
import { startup } from './setup/setupdb';
var bodyParser = require('body-parser');
const app: Express = express();
const port = 8000;

const cors = require('cors');
app.use(cors({
  origin: '*'
}))

// call just once to initialize some data in db - will eliminate later. serves as a "reset" for now
//startup();

const hostroute=require("./routes/hosts.routes");
const jobroute=require("./routes/jobs.routes");
const scheduleroute=require("./routes/schedules.routes");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/hosts", hostroute);
app.use("/jobs", jobroute);
app.use("/schedules", scheduleroute);

// url that requests root route (specified by /) with GET method triggers function below 
app.get('/', (req: Request, res: Response) => {
  res.send('Express + TypeScript Server');
});


// first connect to MongoDB(), then communicate with the web app
const client = connectToMongoDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });
  })
  .catch((error: Error) => {
    console.error("Database connection failed", error)
    process.exit()
  })


  module.exports=client;