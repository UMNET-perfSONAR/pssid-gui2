import express, { Express, Request, Response } from 'express';
var archivers = express.Router();

const {getArchivers,
    readFileNames, 
    readArchiverFile,
    deleteArchiver, 
    postArchiver, 
    updateArchiver} = require('../controllers/archivers.controllers');


archivers.get('/', getArchivers);
archivers.get('/archiver-files',readFileNames);
archivers.get('/read-archiver/:name', readArchiverFile);
archivers.delete('/:archiver_name', deleteArchiver);
archivers.post('/create-archiver', postArchiver);
archivers.put('/update-archiver', updateArchiver);

module.exports=archivers;