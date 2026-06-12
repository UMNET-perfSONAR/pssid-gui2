import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var tests = express.Router();

const {getTests,
       deleteTest,
       postTest,
       updateTest,
       readFileNames,
       readTestFile} = require('../controllers/tests.controllers');


tests.get('/', authorize('read'), getTests);
tests.get('/test-files', authorize('read'), readFileNames);
tests.get('/read-test/:name', authorize('read'), readTestFile);

tests.delete('/:testname', authorize('write'), deleteTest);
tests.post('/create-test', authorize('write'), postTest);

tests.put('/update-test', authorize('write'), updateTest);

module.exports=tests;
