import express from 'express';
import { authorize } from '../shared/accessControl';
var settings = express.Router();

const { getAppSettings, putAppSettings } = require('../controllers/settings.controllers');

settings.get('/', authorize('read'), getAppSettings);
settings.put('/', authorize('write'), putAppSettings);

module.exports = settings;
