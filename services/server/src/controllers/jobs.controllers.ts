import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { get_test_ids } from '../services/utility.services';
import { deleteDocument } from '../services/delete.service';
import { isNameInDB } from './helpers';

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
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = (await client).db('gui').collection('jobs');
    var response = collection.find({"name": name}).toArray();
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
    deleteDocument(batch_col, 'jobs', 'job_ids', deleted?.name);        // delete references from other collections

    await job_col.findOneAndDelete({ "name" : name });       

    res.send('host ' + name + ' was deleted');
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
    (await client).connect();
    var collection = (await client).db('gui').collection('jobs');
    const isDuplicate = await isNameInDB(collection, body.new_job);
    if (isDuplicate && body.old_job !== body.new_job) {
      return res.status(400).json({message:"Job already exists!"});
    }
    let doc = await collection.findOne({name: req.body.old_job});
    await collection.updateOne({
      "name": body.old_job
    }, {$set:{"name": body.new_job, "backoff": body.backoff, "continue-if": body['continue-if'],
              "test_ids": (JSON.stringify(doc?.tests) === JSON.stringify(body.tests)) 
      ? doc?.tests : await get_test_ids(client, body),
              "tests": body.tests
             } 
       }) 
    if (body.old_job !== body.new_job) {                           // Trigger update in batches collection
      updateCollection('batches', 'jobs', client);               // update batches using jobs collection
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
