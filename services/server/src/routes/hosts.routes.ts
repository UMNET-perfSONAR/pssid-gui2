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

hosts.put('/update-host', updateHost);

module.exports=hosts;