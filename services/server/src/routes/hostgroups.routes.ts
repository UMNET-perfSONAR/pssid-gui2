import express, { Express, Request, Response } from 'express';
var hostGroups = express.Router();

const {getHostGroups, 
    getOneHostGroup, 
    deleteHostGroup, 
    postHostGroup, 
    updateHostGroup,
createConfig} = require('../controllers/host-groups.contollers');


hostGroups.get('/', getHostGroups);
hostGroups.get('/:host_group', getOneHostGroup);
hostGroups.post('/config', createConfig);
hostGroups.delete('/:host_group', deleteHostGroup);
hostGroups.post('/create-hostgroup', postHostGroup);
hostGroups.put('/update-hostgroup', updateHostGroup);

module.exports=hostGroups;