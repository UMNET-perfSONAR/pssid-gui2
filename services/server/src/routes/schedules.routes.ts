import express, { Express, Request, Response } from 'express';
var schedules = express.Router();

const {getSchedules,
       postSchedule,
       updateSchedule,
       deleteSchedule}
  = require('../controllers/schedules.controllers');

schedules.get('/', getSchedules);
schedules.post('/create-schedule', postSchedule);
schedules.put('/update-schedule', updateSchedule);
schedules.delete('/:schedulename', deleteSchedule);

module.exports=schedules;
