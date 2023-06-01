import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all hosts
const getHosts = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('hosts');
    const response = await collection.find().project({_id:0, "host":0}).toArray();
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
    const data = req.body; 
    const batchData = data.batchData;
    let object = `${data.name}`;

    var collection = await (await client).db('gui').collection('hosts');
    collection.insertOne({
        "host":data.name,
         [object] : { "batches" : batchData},
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

    let old_host = `${old_hostname}`;
    (await client).connect();
    var collection = await (await client).db('gui').collection('hosts');

    // Update data - Do in two steps - error otherwise. TODO - Look into shortening this
    collection.updateOne({
        "host": old_hostname
    }, {$set:{"host": new_hostname, [old_host+".batches"]:batchData},
     })

     collection.updateOne({
        "host":new_hostname
     }, { $rename:{[old_host]:new_hostname}
     })
    res.json(data);
} )
module.exports = {getHosts, 
                getOneHost, 
                deleteHost, 
                postHost, 
                updateHost};