import express, { Express, Request, Response } from 'express';
var hostGroups = express.Router();

const {getHostGroups, 
    getOneHostGroup, 
    deleteHostGroup, 
    postHostGroup, 
    updateHostGroup} = require('../controllers/host-groups.contollers');


hostGroups.get('/', getHostGroups);
hostGroups.get('/:host_group', getOneHostGroup);
hostGroups.delete('/:host_group', deleteHostGroup);
hostGroups.post('/create-hostgroup', postHostGroup);
hostGroups.put('/update-HostGroup-group', updateHostGroup);

module.exports=hostGroups;