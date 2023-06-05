import express, { Express, Request, Response } from 'express';
var ssidProfiles = express.Router();

const {getSSIDProfiles, 
    getOneSSIDProfile, 
    deleteSSIDProfile, 
    postSSIDProfile, 
    updateSSIDProfile} = require('../controllers/ssidProfiles.controllers');


ssidProfiles.get('/', getSSIDProfiles);
ssidProfiles.get('/:ssidProfile', getOneSSIDProfile);
ssidProfiles.delete('/:ssidProfile-name', deleteSSIDProfile);
ssidProfiles.post('/create-ssidProfile', postSSIDProfile);
ssidProfiles.put('/update-ssidProfile', updateSSIDProfile);

module.exports=ssidProfiles;