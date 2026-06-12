import express from 'express';
import { authorize } from '../shared/accessControl';
var scripts = express.Router();

const { getScripts } = require('../controllers/scripts.controllers');

scripts.get('/files', authorize('read'), getScripts);

module.exports = scripts;
