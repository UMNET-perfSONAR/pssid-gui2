import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { get_test_ids } from '../services/utility.services';
import { deleteDocument } from '../services/delete.service';
import { isNameInDB, isValidObjectName, isValidIso8601Duration, isValidJqExpression, isNameArray } from './helpers';

/**
 * Field rules for a job payload beyond the name, shared by create and update.
 * Returns an error message, or null when the payload is valid. backoff is a
 * pScheduler ISO 8601 duration and continue-if is a jq expression; both
 * mirror the client-side form rules.
 */
const jobFieldError = (body: any): string | null => {
  if (!isValidIso8601Duration(body.backoff)) {
    return "Backoff must be an ISO 8601 duration, e.g. PT30S or PT1H";
  }
  if (!isValidJqExpression(body['continue-if'])) {
    return "continue-if must be a jq expression with balanced brackets";
  }
  if (!isNameArray(body.tests)) {
    return "Tests must be a list of test names";
  }
  return null;
};

var client = connectToMongoDB();

/**
 * Return all job information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getJobs = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('jobs');
    const response = await collection.find().project({_id:0}).toArray();
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Get one job by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneJob = (async (req: Request, res: Response) => {
  try {
    const name = String(req.params.job);
    (await client).connect();
    var collection = (await client).db('gui').collection('jobs');
    var response = await collection.find({"name": name}).project({_id:0}).toArray();
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Delete specified ssid_profile from database. ssid_profile to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteJob = (async (req:Request, res:Response) => {
  try {
    const name = String(req.params.job);
    
    (await client).connect();
    const job_col = (await client).db('gui').collection('jobs');
    const batch_col = (await client).db('gui').collection('batches');

    const deleted = await job_col.findOne({ "name" : name });    
    await deleteDocument(batch_col, 'jobs', 'job_ids', deleted?.name);        // delete references from other collections

    await job_col.findOneAndDelete({ "name" : name });

    res.send('job ' + name + ' was deleted');
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Creates new job entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postJob = (async (req:Request, res:Response) => {
  try {
    if (!isValidObjectName(req.body.name)) {
      return res.status(400).json({message:"Invalid job name"});
    }
    const fieldError = jobFieldError(req.body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
    (await client).connect();
    var collection = (await client).db('gui').collection('jobs');
    const isDuplicate = await isNameInDB(collection, req.body.name);
    if (isDuplicate) {
      return res.status(400).json({message:"Job already exists!"});
    }
    let test_ids = await get_test_ids(client, req.body);
    // NOTE the parallel field is required by perfSONAR and should always be true
    // so it's hardcoded into the database.
    // The user can't change it and the button has been removed from the GUI.
    await collection.insertOne({
      "name":req.body.name,
      "tests": req.body.tests,
      "test_ids": test_ids,
      "continue-if": req.body['continue-if'],
      "backoff": req.body.backoff,
      "parallel": "True"
    });   
    res.json(req.body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Updates jobs with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateJob = (async (req:Request, res:Response) => {
  try {
    let body = req.body;
    if (!isValidObjectName(body.new_job)) {
      return res.status(400).json({message:"Invalid job name"});
    }
    const fieldError = jobFieldError(body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
    (await client).connect();
    var collection = (await client).db('gui').collection('jobs');
    const isDuplicate = await isNameInDB(collection, body.new_job);
    if (isDuplicate && body.old_job !== body.new_job) {
      return res.status(400).json({message:"Job already exists!"});
    }
    // Always recompute the reference ids from the submitted names. This is a
    // handful of indexed lookups, and it self-heals documents whose stored
    // *_ids drifted from the names (an old fast-path bug wrote names into the
    // ids array, which silently broke rename propagation).
    await collection.updateOne({
      // String-coerce so an operator object can't turn this filter into a
      // NoSQL query targeting an arbitrary document (new_job is checked).
      "name": String(body.old_job)
    }, {$set:{"name": body.new_job, "backoff": body.backoff, "continue-if": body['continue-if'],
              "test_ids": await get_test_ids(client, body),
              "tests": body.tests
             }
       })
    if (body.old_job !== body.new_job) {                           // Trigger update in batches collection
      await updateCollection('batches', 'jobs', client);         // update batches using jobs collection
    }
    res.json(body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})
module.exports = {getJobs, 
                  getOneJob, 
                  deleteJob, 
                  postJob, 
                  updateJob};
