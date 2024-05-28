import express, { Express, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/**
 * Return all ssid_profile information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getSSIDProfiles = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('ssid_profiles');
    const response = await collection.find().project({_id:0}).toArray();
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }

})

/**
 * Get one ssid_profile by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneSSIDProfile = (async (req: Request, res: Response) => {
  try {
    const name = String(req.params.SSIDProfilename);
    (await client).connect();
    var collection = (await client).db('gui').collection('ssid_profiles');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Delete specified ssid_profile from database. ssid_profile to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteSSIDProfile = (async (req:Request, res:Response) => {
  try {
    const name = String(req.params.ssidProfile_name);
    (await client).connect();
    var ssid_profile_col = (await client).db('gui').collection('ssid_profiles');
    var batch_col = (await client).db('gui').collection('batches');
    
    const deleted = await ssid_profile_col.findOne({ "name" : name });    
    
    deleteDocument(batch_col, 'ssid_profiles', 'ssid_profile_ids', deleted?.name);        // delete references from other collections
    
    await ssid_profile_col.findOneAndDelete({ "name" : name });                           // remove from collection 
    
    res.send('ssid_profile ' + name + ' was deleted')
  }

  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Creates new ssid_profile entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postSSIDProfile = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    console.log('ssid')
    var collection = (await client).db('gui').collection('ssid_profiles');
    
    await collection.insertOne({
      "name": req.body.name,
      "SSID": req.body.ssid,
      "test_level": req.body.test_level,
      "min_signal": req.body.min_signal
    });   
    res.json(req.body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Updates ssid_profile with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateSSIDProfile = (async (req:Request, res:Response) => {
  try {
    let body = req.body;
    (await client).connect();
    console.log(body.old_ssid_name);
    var collection = (await client).db('gui').collection('ssid_profiles');
    await collection.updateOne({
      "name": body.old_ssid_name
    }, {$set:{"name": body.new_ssid_name, "SSID": body.ssid,
              "test_level": body.test_level, "min_signal": body.min_signal},
       })
    
    if (body.old_ssid_name !== body.new_ssid_name) {               // Trigger update in batches collection
      updateCollection('batches', 'ssid_profiles', client)       // update batches using ssid_profiles collection
    }
    res.json(body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})
module.exports = {getSSIDProfiles, 
                  getOneSSIDProfile, 
                  deleteSSIDProfile, 
                  postSSIDProfile, 
                  updateSSIDProfile};
