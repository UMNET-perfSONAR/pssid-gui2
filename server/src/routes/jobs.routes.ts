import express, { Express, Request, Response } from 'express';

const jobs = express.Router();

const getJobs = require('../controllers/jobs.controllers');

jobs.get("/", getJobs);

module.exports=jobs;
