import express, { Express, Request, Response } from 'express';
var hosts = express.Router();

const {getHosts, 
    getOneHost, 
    deleteHost, 
    postHost,
    updateHost} = require('../controllers/hosts.controllers');


hosts.get('/', getHosts);
hosts.get('/:hostname', getOneHost);
hosts.delete('/:hostname', deleteHost);
hosts.post('/create-host', postHost);
// hosts.put('/host/:old_host/:new_hostname/:new_batches', updateHost);

hosts.put('/updateHost', updateHost);

module.exports=hosts;