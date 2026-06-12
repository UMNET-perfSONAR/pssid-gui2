import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var hosts = express.Router();

const {getHosts,
       getOneHost,
       deleteHost,
       postHost,
       deleteAll,
       updateHost,
       createConfig} = require('../controllers/hosts.controllers');


hosts.get('/', authorize('read'), getHosts);
hosts.get('/:hostname', authorize('read'), getOneHost);
hosts.delete('/:hostname', authorize('write'), deleteHost);
hosts.post('/config', authorize('write'), createConfig);
hosts.post('/create-host', authorize('write'), postHost);
hosts.delete('/', authorize('write'), deleteAll)
hosts.put('/update-host', authorize('write'), updateHost);

module.exports=hosts;
