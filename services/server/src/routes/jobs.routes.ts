import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var jobs = express.Router();

const {getJobs,
       getOneJob,
       deleteJob,
       postJob,
       updateJob} = require('../controllers/jobs.controllers');


jobs.get('/', authorize('read'), getJobs);
jobs.get('/:job', authorize('read'), getOneJob);
jobs.delete('/:job', authorize('write'), deleteJob);
jobs.post('/create-job', authorize('write'), postJob);

jobs.put('/update-job', authorize('write'), updateJob);

module.exports=jobs;
