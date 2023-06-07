import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/**
 * Return all ssid_profile information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getSSIDProfiles = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('ssid_profiles');
    const response = await collection.find().project({_id:0}).toArray();
    console.log(response);
    res.send(response);
})

/**
 * Get one ssid_profile by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneSSIDProfile = (async (req: Request, res: Response) => {
    const name = String(req.params.SSIDProfilename);
    (await client).connect();
    var collection = await (await client).db('gui').collection('ssid_profiles');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

/**
 * Delete specified ssid_profile from database. ssid_profile to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteSSIDProfile = (async (req:Request, res:Response) => {
    const name = String(req.params.SSIDProfilename);
    (await client).connect();
    var collection = await (await client).db('gui').collection('ssid_profiles');
    await collection.findOneAndDelete({ "name" : name });
    res.send('ssid_profile ' + name + ' was deleted')
})

/**
 * Creates new ssid_profile entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
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

/**
 * Updates ssid_profile with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateSSIDProfile = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = (await client).db('gui').collection('ssid_profiles');
    collection.updateOne({
        "name": body.old_ssid_name
    }, {$set:{"name": body.new_ssid_name, "SSID": body.ssid,
              "min_signal": body.min_signal},
     })
    
    if (body.old_ssid_name !== body.new_ssid_name) {               // Trigger update in batches collection
        updateCollection('batches', 'ssid_profiles', client)       // update batches using ssid_profiles collection
    }
    res.json(body);
} )
module.exports = {getSSIDProfiles, 
                getOneSSIDProfile, 
                deleteSSIDProfile, 
                postSSIDProfile, 
                updateSSIDProfile};