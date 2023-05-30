"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
var schedules = express_1.default.Router();
const getSchedules = require('../controllers/schedules.controllers');
schedules.get('/', getSchedules);
module.exports = schedules;
