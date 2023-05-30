"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jobs = express_1.default.Router();
const getJobs = require('../controllers/jobs.controllers');
jobs.get("/", getJobs);
module.exports = jobs;
