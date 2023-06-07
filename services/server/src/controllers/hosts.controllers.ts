import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';

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
    const collection = await (await client).db('gui').collection('hosts');
    const response = await collection.find().toArray();
    console.log(response);
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
    var collection = await (await client).db('gui').collection('hosts');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

/**
 * Delete specified host from database. host to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteHost = (async (req:Request, res:Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    await collection.findOneAndDelete({ "name" : name });
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
    var collection = await (await client).db('gui').collection('hosts');
    collection.insertOne({
        "name":req.body.name,
        "batches": req.body.batches,
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
    var collection = await (await client).db('gui').collection('hosts');
    collection.updateOne({
        "name": body.old_hostname
    }, {$set:{"name": body.new_hostname, "batches": body.batches,
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