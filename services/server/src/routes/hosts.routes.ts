import express, { Express, Request, Response } from 'express';
var hosts = express.Router();

const {getHosts, 
       getOneHost, 
       deleteHost, 
       postHost,
       deleteAll,
       updateHost,
       createConfig} = require('../controllers/hosts.controllers');


hosts.get('/', getHosts);
hosts.get('/:hostname', getOneHost);
hosts.delete('/:hostname', deleteHost);
hosts.post('/config', createConfig);
hosts.post('/create-host', postHost);
hosts.delete('/', deleteAll)
hosts.put('/update-host', updateHost);

module.exports=hosts;
