import express, { Express, Request, Response } from 'express';
var tests = express.Router();

const {getTests, 
    getOneTest, 
    deleteTest, 
    postTest,
    updateTest} = require('../controllers/tests.controllers');


tests.get('/', getTests);
tests.get('/:testname', getOneTest);
tests.delete('/:testname', deleteTest);
tests.post('/create-test', postTest);

tests.put('/update-test', updateTest);

module.exports=tests;