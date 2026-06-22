import express from 'express';
import { authorize } from '../shared/accessControl';
var provision = express.Router();

const { getProvisionPreview } = require('../controllers/provision.controllers');

provision.get('/preview', authorize('read'), getProvisionPreview);

module.exports = provision;
