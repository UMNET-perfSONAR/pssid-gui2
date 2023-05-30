import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all hosts
const getHosts = (async (req: Request, res: Response) =>{
    (await client).connect();
    var response = await (await client).db('gui').collection('hosts').find().toArray();
    console.log(response);
    res.send(response);
})

// get a single host
const getOneHost = (async (req: Request, res: Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    var response = collection.find({"host": name}).toArray();
    res.send(response); 
})

// delete a single host
const deleteHost = (async (req:Request, res:Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    await collection.findOneAndDelete({ "host" : name });
    res.send('Host ' + name + ' was deleted')
})

// add a single host to db 
const postHost = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    var data = req.body; 
    collection.insertOne({
        "host":data.name,
        "batches":data.batchData
    });
    res.json(req.body);
})


// TODO: Add option to provide meta-information 
// completely update one host
const updateHost = (async (req:Request, res:Response) => {
    const data = req.body;
    const old_hostname = data.old_hostname;
    const new_hostname = data.new_hostname;
    const batchData = data.batchData;

    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');
    collection.updateOne({
        "host": old_hostname
    }, {$set:{"host": new_hostname, "batches": batchData}
     });
    
    res.json(data);
} )
module.exports = {getHosts, 
                getOneHost, 
                deleteHost, 
                postHost, 
                updateHost};