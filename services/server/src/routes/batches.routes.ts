import express, { Express, Request, Response } from 'express';
var batches = express.Router();

const {getBatches, 
       getOneBatch, 
       deleteBatch, 
       postBatch,
       updateBatch} = require('../controllers/batches.controllers');


batches.get('/', getBatches);
batches.get('/:batchname', getOneBatch);
batches.delete('/:batchname', deleteBatch);
batches.post('/create-batch', postBatch);
batches.put('/update-batch', updateBatch);

module.exports=batches;
