import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all hosts
const getHosts = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('hosts');
    const response = await collection.find().toArray();
    console.log(response);
    res.send(response);
})

// get a single host
const getOneHost = (async (req: Request, res: Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

// delete a single host
const deleteHost = (async (req:Request, res:Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    await collection.findOneAndDelete({ "name" : name });
    res.send('host ' + name + ' was deleted')
})

// add a single host to db 
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

// TODO: Add option to provide meta-information 
// completely update one host
const updateHost = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    collection.updateOne({
        "name": body.old_hostname
    }, {$set:{"name": body.new_hostname, "batches": body.batches,
              "data": body.data},
     })
    res.json(body);
} )
module.exports = {getHosts, 
                getOneHost, 
                deleteHost, 
                postHost, 
                updateHost};