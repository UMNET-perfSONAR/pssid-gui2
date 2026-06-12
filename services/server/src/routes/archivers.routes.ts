import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var archivers = express.Router();

const {getArchivers,
       readFileNames,
       readArchiverFile,
       deleteArchiver,
       postArchiver,
       updateArchiver} = require('../controllers/archivers.controllers');


archivers.get('/', authorize('read'), getArchivers);
archivers.get('/archiver-files', authorize('read'), readFileNames);
archivers.get('/read-archiver/:name', authorize('read'), readArchiverFile);
archivers.delete('/:archiver_name', authorize('write'), deleteArchiver);
archivers.post('/create-archiver', authorize('write'), postArchiver);
archivers.put('/update-archiver', authorize('write'), updateArchiver);

module.exports=archivers;
