import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var hostGroups = express.Router();

const {getHostGroups,
       getOneHostGroup,
       deleteHostGroup,
       postHostGroup,
       updateHostGroup,
       createConfig} = require('../controllers/host-groups.contollers');


hostGroups.get('/', authorize('read'), getHostGroups);
hostGroups.get('/:host_group', authorize('read'), getOneHostGroup);
hostGroups.post('/config', authorize('write'), createConfig);
hostGroups.delete('/:host_group', authorize('write'), deleteHostGroup);
hostGroups.post('/create-hostgroup', authorize('write'), postHostGroup);
hostGroups.put('/update-hostgroup', authorize('write'), updateHostGroup);

module.exports=hostGroups;
