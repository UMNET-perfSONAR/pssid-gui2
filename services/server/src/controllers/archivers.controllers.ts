import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';
// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/**
 * Return all archiver information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getArchivers = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('archivers');
    const response = await collection.find().project({_id:0}).toArray();
    console.log(response);
    res.send(response);
})

/**
 * Get one archiver by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneArchiver = (async (req: Request, res: Response) => {
    const name = String(req.params.Archivername);
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

/**
 * Delete specified archiver from database. archiver to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteArchiver = (async (req:Request, res:Response) => {
    const name = String(req.params.Archivername);
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    await collection.findOneAndDelete({ "name" : name });
    res.send('archiver ' + name + ' was deleted')
})

/**
 * Creates new archiver entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postArchiver = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    collection.insertOne({
        "name": req.body.name,
        "archiver": req.body.archiver,
        "data": req.body.data
    });   
    res.json(req.body);
})

/**
 * Updates archiver with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateArchiver = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    // Update data - Do in two steps - error otherwise. TODO - Look into shortening this
    collection.updateOne({
        "name": body.old_arc_name
    }, {$set:{"name": body.new_arc_name, "archiver": body.archiver,
              "data": body.data},
    });
    if (body.old_arc_name !== body.new_arc_name) {               // Trigger update in batches collection
        updateCollection('batches', 'archivers', client)       // update batches using ssid_profiles collection
    }
    res.json(body);
} )

module.exports = {getArchivers, 
                getOneArchiver, 
                deleteArchiver, 
                postArchiver, 
                updateArchiver};