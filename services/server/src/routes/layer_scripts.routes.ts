import express from 'express';
import { authorize } from '../shared/accessControl';
var layerScripts = express.Router();

const { getLayer2Scripts, getLayer3Scripts } = require('../controllers/layer_scripts.controllers');

layerScripts.get('/layer2-files', authorize('read'), getLayer2Scripts);
layerScripts.get('/layer3-files', authorize('read'), getLayer3Scripts);

module.exports = layerScripts;
