import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var schedules = express.Router();

const {getSchedules,
       postSchedule,
       updateSchedule,
       deleteSchedule}
  = require('../controllers/schedules.controllers');

schedules.get('/', authorize('read'), getSchedules);
schedules.post('/create-schedule', authorize('write'), postSchedule);
schedules.put('/update-schedule', authorize('write'), updateSchedule);
schedules.delete('/:schedulename', authorize('write'), deleteSchedule);

module.exports=schedules;
