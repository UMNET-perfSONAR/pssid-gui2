import express, { Express, Request, Response } from 'express';
var tests = express.Router();

const {getTests, 
    getOneTest, 
    deleteTest, 
    postTest,
    updateTest,
    readFileNames,
    readTestFile} = require('../controllers/tests.controllers');


tests.get('/', getTests);
tests.get('/test-files',readFileNames);
tests.get('/read-test/:name', readTestFile);

tests.delete('/:testname', deleteTest);
tests.post('/create-test', postTest);

tests.put('/update-test', updateTest);

module.exports=tests;