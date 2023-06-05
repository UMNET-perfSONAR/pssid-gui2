import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all SSIDProfiles
const getSSIDProfiles = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('ssid_profiles');
    const response = await collection.find().project({_id:0}).toArray();
    console.log(response);
    res.send(response);
})

// get a single SSIDProfile
const getOneSSIDProfile = (async (req: Request, res: Response) => {
    const name = String(req.params.SSIDProfilename);
    (await client).connect();
    var collection = await (await client).db('gui').collection('ssid_profiles');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

// delete a single SSIDProfile
const deleteSSIDProfile = (async (req:Request, res:Response) => {
    const name = String(req.params.SSIDProfilename);
    (await client).connect();
    var collection = await (await client).db('gui').collection('ssid_profiles');
    await collection.findOneAndDelete({ "name" : name });
    res.send('ssid_profile ' + name + ' was deleted')
})

// add a single SSIDProfile to db 
const postSSIDProfile = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('ssid_profiles');
    collection.insertOne({
        "name": req.body.name,
        "SSID": req.body.ssid,
        "min_signal": req.body.min_signal
    });   
    res.json(req.body);
})

// TODO: Add option to provide meta-information 
// completely update one SSIDProfile
const updateSSIDProfile = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('ssid_profiles');
    collection.updateOne({
        "name": body.old_ssid_name
    }, {$set:{"name": body.new_ssid_name, "SSID": body.ssid,
              "min_signal": body.min_signal},
     })
    res.json(body);
} )
module.exports = {getSSIDProfiles, 
                getOneSSIDProfile, 
                deleteSSIDProfile, 
                postSSIDProfile, 
                updateSSIDProfile};