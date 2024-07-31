import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';
import { get_ssid_profile_ids, get_schedule_ids, get_job_ids } from '../services/utility.services'
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';
import { isNameInDB } from './helpers';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/**
 * Return all batch information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getBatches = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('batches');
    const response = await collection.find().project({_id:0,  
                                                      "ssid_profile_ids":0}
                                                    ).toArray();
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Get one batch from batches collection by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneBatch = (async (req: Request, res: Response) => {
  try {
    const batch = String(req.params.batch);
    (await client).connect();
    var collection = await (await client).db('gui').collection('batches');
    var response = collection.find({"name": batch}).project({_id:0}).toArray();
    res.send(response); 
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Delete specified batch from database. batch to be deleted comes as URL parameter 
 * 
 * @param req - request information from client. specific batch in 
 * @param res - response sent back to client 
 */
const deleteBatch = (async (req:Request, res:Response) => {
  try {
    const batch = String(req.params.batchname);
    (await client).connect();
    let batch_col= (await client).db('gui').collection('batches');
    let deleted = await batch_col.findOne({ "name" : batch });

    for await (const item of ['hosts', 'host_groups']) {
      const outdated_collection = (await client).db('gui').collection(item); 
      await deleteDocument(outdated_collection, 'batches', 'batch_ids', deleted?.name); 
    }
    await batch_col.findOneAndDelete({ "name" : batch });                           // remove from collection 
    res.send('batch ' + batch + ' was deleted!');
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Creates new batch entry in database. Inserts ObjectId arrays for ssid_profiles, jobs, schedules
 * to make compatible with future updates.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postBatch = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    var collection = (await client).db('gui').collection('batches');
    const isDuplicate = await isNameInDB(collection, req.body.name);
    if (isDuplicate) {
      return res.status(400).json({message: "Batch already exists!"});
    }

    var data = req.body;
    const ssid_profile_ids = await get_ssid_profile_ids(client, data); 
    const schedule_ids = await get_schedule_ids(client, data); 
    const job_ids = await get_job_ids(client, data);

    collection.insertOne({                                  // include names and _ids of objects 
      "name": data.name,
      "priority": data.priority,
      "test_interface": data.test_interface,
      "ssid_profiles": data.ssid_profiles,
      "ssid_profile_ids": ssid_profile_ids,
      "schedules": data.schedules,
      "schedule_ids": schedule_ids,
      "jobs": data.jobs,
      "job_ids": job_ids
    });
    res.json(data);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})


/**
 * Updates batch with information specified by the user. 
 * Triggers updates in hosts and host_groups to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateBatch = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    let collection = (await client).db('gui').collection('batches');
    const isDuplicate = await isNameInDB(collection, req.body.new_batchname);
    if (isDuplicate && req.body.old_batchname !== req.body.new_batchname) {
      return res.status(400).json({message:"Batch already exists!"});
    }
    let data = req.body;
    let doc = await collection.findOne({name: data.old_batchname});
    
    await collection.updateOne({
      "name": data.old_batchname
    }, {$set:{"name": data.new_batchname, "priority": data.priority,
              "test_interface":data.test_interface, "ttl": data.ttl,
              "ssid_profiles":data.ssid_profiles, "schedules":data.schedules,
              "jobs": data.jobs,
              "ssid_profile_ids": (JSON.stringify(data.ssid_profiles) === JSON.stringify(doc?.ssid_profiles)) ?     // update reference _ids if changes made 
      doc?.ssid_profile_ids: await get_ssid_profile_ids(client, data),

              "schedule_ids": (JSON.stringify(data.schedules) === JSON.stringify(doc?.schedules)) ? 
      doc?.schedules: await get_schedule_ids(client, data),

              "job_ids": (JSON.stringify(data.jobs) === JSON.stringify(doc?.jobs)) ? 
      doc?.job_ids: await get_job_ids(client, data),
             }
       });

    if (data.old_batchname !== data.new_batchname) {           // trigger host and host_groups updates
      updateCollection('hosts', 'batches', client);           // update hosts using batches collection
      updateCollection('host_groups', 'batches', client);     // update host_groups using batches collection
    }
    res.json(data);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
} )

module.exports = {getBatches, 
                  getOneBatch, 
                  deleteBatch, 
                  postBatch, 
                  updateBatch};
