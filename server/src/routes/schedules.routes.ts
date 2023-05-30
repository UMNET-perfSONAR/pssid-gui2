import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/ideas.service';
var schedules = express.Router();

const getSchedules = require('../controllers/schedules.controllers');

schedules.get('/', getSchedules);

module.exports=schedules;