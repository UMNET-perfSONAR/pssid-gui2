import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection, ObjectId } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
import { get_batch_ids, get_host_ids } from '../services/utility.services';

var client = connectToMongoDB();

/**
 * Return all host_group information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getHostGroups = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = (await client).db('gui').collection('host_groups');
    const response = await collection.find().project({_id:0}).toArray();
    res.send(response);
})

/**
 * Get one host_group by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneHostGroup = (async (req: Request, res: Response) => {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = (await client).db('gui').collection('host_groups');
    var response = collection.find({"name": host_group}).project({_id:0}).toArray();
    res.send(response); 
})

/**
 * Delete specified host_group from database. host_group to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteHostGroup = (async (req:Request, res:Response) => {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = (await client).db('gui').collection('host_groups');
    await collection.findOneAndDelete({ "name" : host_group });
    res.send('Host ' + host_group + ' was deleted!')
})


/**
 * Creates new host_group entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postHostGroup = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = (await client).db('gui').collection('host_groups');
    var data = req.body; 

    collection.insertOne({
        "name":data.host_group,
        "batches":data.batches,
        "batch_ids": await get_batch_ids(client, data),
        "hosts": data.hosts,
        "host_ids": await get_host_ids(client, data),
    });

    res.json(data);
})

/**
 * Updates host_group with information specified by the user. 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateHostGroup = (async (req:Request, res:Response) => {
    (await client).connect();
    let data = req.body;
    let collection = (await client).db('gui').collection('host_groups');
    let doc = await collection.findOne({name: req.body.old_hostname});
    await collection.updateOne({
        "name": data.old_host_group
    }, {$set:{"name": data.new_host_group, "hosts":data.hosts, 
              "batches": data.batches, "data": data.data,
              "batch_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc?.batches)) ?     // update reference _ids if changes made 
               doc?.batches: await get_batch_ids(client, req.body),
               "host_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc?.hosts)) ?     // update reference _ids if changes made 
               doc?.hosts: await get_host_ids(client, req.body),}
     });
    res.json(data);
} )
module.exports = {getHostGroups, 
                getOneHostGroup, 
                deleteHostGroup, 
                postHostGroup, 
                updateHostGroup};