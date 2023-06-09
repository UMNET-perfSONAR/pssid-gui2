import express, { Express, Request, Response } from 'express';
var jobs = express.Router();

const {getJobs, 
    getOneJob, 
    deleteJob, 
    postJob,
    updateJob} = require('../controllers/jobs.controllers');

 
jobs.get('/', getJobs);
jobs.get('/:job', getOneJob);
jobs.delete('/:job', deleteJob);
jobs.post('/create-job', postJob);

jobs.put('/update-job', updateJob);

module.exports=jobs;