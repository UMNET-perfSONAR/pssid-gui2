"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
var jobs = express_1.default.Router();
const { getJobs, getOneJob, deleteJob, postJob, updateJob } = require('../controllers/jobs.controllers');
jobs.get('/', getJobs);
jobs.get('/:job', getOneJob);
jobs.delete('/:job', deleteJob);
jobs.post('/create-job', postJob);
jobs.put('/update-job', updateJob);
module.exports = jobs;
