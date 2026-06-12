import express, { Express, Request, Response } from 'express';
import { authorize } from '../shared/accessControl';
var batches = express.Router();

const {getBatches,
       getOneBatch,
       deleteBatch,
       postBatch,
       updateBatch} = require('../controllers/batches.controllers');


batches.get('/', authorize('read'), getBatches);
batches.get('/:batchname', authorize('read'), getOneBatch);
batches.delete('/:batchname', authorize('write'), deleteBatch);
batches.post('/create-batch', authorize('write'), postBatch);
batches.put('/update-batch', authorize('write'), updateBatch);

module.exports=batches;
