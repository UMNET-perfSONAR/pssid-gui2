import express, { Express, Request, Response } from 'express';
var ssidProfiles = express.Router();

const {getSSIDProfiles, 
       getOneSSIDProfile, 
       deleteSSIDProfile, 
       postSSIDProfile, 
       updateSSIDProfile} = require('../controllers/ssid_profiles.controllers');


ssidProfiles.get('/', getSSIDProfiles);
ssidProfiles.get('/:ssidProfile', getOneSSIDProfile);
ssidProfiles.delete('/:ssidProfile_name', deleteSSIDProfile);
ssidProfiles.post('/create-ssidProfile', postSSIDProfile);
ssidProfiles.put('/update-ssidProfile', updateSSIDProfile);

module.exports=ssidProfiles;
