"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
var schedules = express_1.default.Router();
const { getSchedules, postSchedule, updateSchedule, deleteSchedule } = require('../controllers/schedules.controllers');
schedules.get('/', getSchedules);
schedules.post('/create-schedule', postSchedule);
schedules.put('/update-schedule', updateSchedule);
schedules.delete('/:schedulename', deleteSchedule);
module.exports = schedules;
