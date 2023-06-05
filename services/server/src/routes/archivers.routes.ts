import express, { Express, Request, Response } from 'express';
var archivers = express.Router();

const {getArchivers, 
    getOneArchiver, 
    deleteArchiver, 
    postArchiver, 
    updateArchiver} = require('../controllers/archivers.contollers');


archivers.get('/', getArchivers);
archivers.get('/:archiver', getOneArchiver);
archivers.delete('/:archiver-name', deleteArchiver);
archivers.post('/create-archiver', postArchiver);
archivers.put('/update-archiver', updateArchiver);

module.exports=archivers;