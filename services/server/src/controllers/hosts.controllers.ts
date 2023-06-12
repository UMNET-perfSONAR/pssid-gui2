import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';
import { get_batch_ids } from '../services/utility.services';
import { hostname } from 'os';
import { deleteDocument } from '../services/delete.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/**
 * Return all host information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getHosts = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = (await client).db('gui').collection('hosts');
    const response = await collection.find().toArray();
    res.send(response);
})

/**
 * Get one host by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneHost = (async (req: Request, res: Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

/**
 * Delete specified host from database. host to be deleted comes as URL parameter
 * 
 * TODO - Compress to one lookup (findOneAndDelete)
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteHost = (async (req:Request, res:Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var hosts_col = (await client).db('gui').collection('hosts');
    const deleted = await hosts_col.findOne({ "name" : name });
   
    var host_groups_col = (await client).db('gui').collection('host_groups');
    deleteDocument(host_groups_col, 'hosts', 'host_ids', deleted?.name);           // delete references from other collections

    await hosts_col.findOneAndDelete({ "name" : name });                           // remove from collection 

    res.send('host ' + name + ' was deleted')
})

/**
 * Creates new host entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postHost = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    let batch_ids = await get_batch_ids(client, req.body);
    console.log(batch_ids);
    collection.insertOne({
        "name":req.body.name,
        "batches": req.body.batches,
        "batch_ids": batch_ids,
        "data": req.body.data
    });   
    res.json(req.body);
})

/**
 * Updates host with information specified by the user. 
 * Triggers update in host_groups to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateHost = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    let doc = await collection.findOne({name: req.body.old_hostname});
    
    await collection.updateOne({
        "name": body.old_hostname
    }, {$set:{"name": body.new_hostname, "batches": body.batches,
              "batch_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc?.batches)) ?     // update reference _ids if changes made 
                            doc?.batches: await get_batch_ids(client, req.body),
            "data": body.data},
     })

     if (body.new_hostname !== body.old_hostname) {            // Trigger update in hosts
        updateCollection('host_groups', 'hosts', client);      // update host_groups using hosts collection
     }
    res.json(body);
} )
module.exports = {getHosts, 
                getOneHost, 
                deleteHost, 
                postHost, 
                updateHost};