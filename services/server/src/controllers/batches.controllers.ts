import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/ideas.service';
import { get_ssid_profile_ids, get_schedule_ids, get_job_ids, get_archiver_ids } from '../services/utility.services'
import { updateCollection } from '../services/update.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/**
 * Return all batch information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getBatches = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = (await client).db('gui').collection('batches');
    const response = await collection.find().project({_id:0, "schedule_ids":0, "job_ids":0, 
                                                    "archiver_ids":0, "ssid_profile_ids":0}
                                                    ).toArray();
    res.send(response);
})

/**
 * Get one batch from batches collection by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneBatch = (async (req: Request, res: Response) => {
    const batch = String(req.params.batch);
    (await client).connect();
    var collection = await (await client).db('gui').collection('batches');
    var response = collection.find({"name": batch}).project({_id:0}).toArray();
    res.send(response); 
})

/**
 * Delete specified batch from database. batch to be deleted comes as URL parameter 
 * 
 * @param req - request information from client. specific batch in 
 * @param res - response sent back to client 
 */
const deleteBatch = (async (req:Request, res:Response) => {
    const batch = String(req.params.batch);
    (await client).connect();
    var collection = await (await client).db('gui').collection('batches');
    await collection.findOneAndDelete({ "name" : batch });
    res.send('batch ' + batch + ' was deleted!')
})

/**
 * Creates new batch entry in database. Inserts ObjectId arrays for ssid_profiles, jobs, schedules, archivers 
 * to make compatible with future updates. 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postBatch = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('batches');
    var data = req.body; 

    const ssid_profile_ids = get_ssid_profile_ids(client, data); 
    const schedule_ids = get_schedule_ids(client, data); 
    const job_ids = get_job_ids(client, data);
    const archiver_ids = get_archiver_ids(client, data); 

    collection.insertOne({                                  // include names and _ids of objects 
        "name": data.name,
        "priority": data.priority,
        "bssid_scan_interface": data.bssid_scan_interface,
        "ttl": data.ttl, 
        "SSID-profiles": data.ssid_profiles,
        "SSID-profile_ids": ssid_profile_ids,
        "schedule": data.schedule,
        "schedule_ids": schedule_ids,
        "jobs": data.jobs,
        "job_ids": job_ids,
        "archivers": data.archivers,
        "archiver_ids": archiver_ids
    });
    res.json(data);
})


/**
 * Updates batch with information specified by the user. 
 * Triggers updates in hosts and host_groups to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateBatch = (async (req:Request, res:Response) => {
    (await client).connect();
    let collection = (await client).db('gui').collection('batches');
    let data = req.body;
    let doc = await collection.findOne({name: data.old_batchname})
   
    collection.updateOne({
        "name": data.old_batchname
    }, {$set:{"name": data.new_batchname, "priority": data.priority,
              "bssid_scan_interface":data.bssid_scan_interface, "ttl": data.ttl, 
              "SSID-profiles":data.ssid_profiles, "schedule":data.schedule,
              "jobs": data.jobs, "archivers": data.archivers,
              "batches": data.batches, "data": data.data,
              "SSID-profile_ids": (data.ssid_profiles === doc?.ssid_profiles ) ? doc?.ssid_profile_ids: get_ssid_profile_ids(client, data),
              "schedule_ids": (data.schedule === doc?.schedule ) ? doc?.schedule: get_schedule_ids(client, data),
              "archiver_ids": (data.archiver === doc?.archiver ) ? doc?.archiver_ids: get_archiver_ids(client, data),
              "job_ids": (data.job === doc?.job ) ? doc?.job_ids: get_job_ids(client, data),
            }
     });

     if (data.old_batchname !== data.new_batchname) {           // trigger host and host_groups updates
        updateCollection('hosts', 'batches', client);           // update hosts using batches collection
        updateCollection('host_groups', 'batches', client);     // update host_groups using batches collection
     }
    res.json(data);
} )

module.exports = {getBatches, 
                getOneBatch, 
                deleteBatch, 
                postBatch, 
                updateBatch};