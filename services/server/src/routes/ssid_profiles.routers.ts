import express, { Express, Request, Response } from 'express';
import { requiresAuth } from 'express-openid-connect';
import config from '../shared/config'
import { authorize } from '../shared/accessControl';
var ssidProfiles = express.Router();

const {getSSIDProfiles, 
       getOneSSIDProfile, 
       deleteSSIDProfile, 
       postSSIDProfile, 
       updateSSIDProfile} = require('../controllers/ssid_profiles.controllers');

ssidProfiles.get('/', authorize('read'), getSSIDProfiles);
ssidProfiles.get('/:ssidProfile', authorize('read'), getOneSSIDProfile);
ssidProfiles.delete('/:ssidProfile_name', authorize('write'), deleteSSIDProfile);
ssidProfiles.post('/create-ssidProfile', authorize('write'), postSSIDProfile);
ssidProfiles.put('/update-ssidProfile', authorize('write'), updateSSIDProfile);


module.exports=ssidProfiles;
