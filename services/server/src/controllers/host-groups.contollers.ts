import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection, ObjectId } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
import { lookup } from 'dns';
// import { client } from '../index';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all HostGroups
const getHostGroups = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = (await client).db('gui').collection('host_groups');
    const response = await collection.find().project({_id:0, "host_ids":0}).toArray();
    res.send(response);
})

// get a single host
const getOneHostGroup = (async (req: Request, res: Response) => {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    var response = collection.find({"name": host_group}).project({_id:0}).toArray();
    res.send(response); 
})

// delete a single host
const deleteHostGroup = (async (req:Request, res:Response) => {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    await collection.findOneAndDelete({ "name" : host_group });
    res.send('Host ' + host_group + ' was deleted!')
})

// add a single host to db 
const postHostGroup = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('host_groups');
    var data = req.body; 

    // test to see if manual reference works 
    var host = await (await client).db('gui').collection('hosts');
    var host_arr = [];
    host_arr.length += data.hosts.length;
    for (let i = 0; i < data.hosts.length; i++) {
        host_arr[i] = (await host.findOne({"name":`${data.hosts[i]}`}))?._id
    }

    collection.insertOne({
        "name":data.host_group,
        "batches":data.batches,
        "hosts_ids": host_arr,
    });

    res.json(data);
})


// TODO: Add option to provide meta-information 
// completely update one host
const updateHostGroup = (async (req:Request, res:Response) => {
    (await client).connect();
    let data = req.body;
    let collection = (await client).db('gui').collection('host_groups');
    collection.updateOne({
        "name": data.old_host_group
    }, {$set:{"name": data.new_host_group, "hosts":data.hosts, 
              "batches": data.batches, "data": data.data}
     });
    res.json(data);
} )
module.exports = {getHostGroups, 
                getOneHostGroup, 
                deleteHostGroup, 
                postHostGroup, 
                updateHostGroup};