import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
// import { client } from '../index';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all HostGroups
const getHostGroups = (async (req: Request, res: Response) =>{
    (await client).connect();
    var response = await (await client).db('gui').collection('host_groups').find().toArray();
    console.log(response);
    res.send(response);
})

// get a single host
const getOneHost = (async (req: Request, res: Response) => {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    var response = collection.find({"host": host_group}).toArray();
    res.send(response); 
})

// delete a single host
const deleteHost = (async (req:Request, res:Response) => {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    await collection.findOneAndDelete({ "host_group" : host_group });
    res.send('Host ' + host_group + ' was deleted')
})

// add a single host to db 
const postHost = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    var data = req.body; 
    collection.insertOne({
        "host_group":data.host_group,
        "hosts":data.hosts,
        "batches":data.batchData
    });
    res.json(req.body);
})


// TODO: Add option to provide meta-information 
// completely update one host
const updateHost = (async (req:Request, res:Response) => {
    const data = req.body;
    const old_host_group = data.old_host_group;
    const new_host_group = data.new_host_group;
    const hosts = data.hosts;
    const batchData = data.batchData;

    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    collection.updateOne({
        "host": old_host_group
    }, {$set:{"host": new_host_group, "hosts":hosts, "batches": batchData}
     });
    
    res.json(data);
} )
module.exports = {getHostGroups, 
                getOneHost, 
                deleteHost, 
                postHost, 
                updateHost};