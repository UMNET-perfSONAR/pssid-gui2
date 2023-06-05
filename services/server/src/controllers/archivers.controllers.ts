import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all Archivers
const getArchivers = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('archivers');
    const response = await collection.find().project({_id:0}).toArray();
    console.log(response);
    res.send(response);
})

// get a single Archiver
const getOneArchiver = (async (req: Request, res: Response) => {
    const name = String(req.params.Archivername);
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

// delete a single Archiver
const deleteArchiver = (async (req:Request, res:Response) => {
    const name = String(req.params.Archivername);
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    await collection.findOneAndDelete({ "name" : name });
    res.send('archiver ' + name + ' was deleted')
})

// add a single Archiver to db 
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

// TODO: Add option to provide meta-information 
// completely update one Archiver
const updateArchiver = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    // Update data - Do in two steps - error otherwise. TODO - Look into shortening this
    collection.updateOne({
        "name": body.old_arc_name
    }, {$set:{"name": body.new_arc_name, "archiver": body.archiver,
              "data": body.data},
     })
    res.json(body);
} )
module.exports = {getArchivers, 
                getOneArchiver, 
                deleteArchiver, 
                postArchiver, 
                updateArchiver};