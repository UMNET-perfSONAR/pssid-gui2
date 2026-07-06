import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';
import { isNameInDB } from './helpers';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

const getPathsConfig = (): any => {
  const configFilePath = path.join(__dirname, '../../paths_config.json');
  return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
};

/**
 * Validates a chosen layer-2 / layer-3 method name before it is persisted and
 * later written into pssid_config.json. Empty means "none" (rejected upstream
 * where a method is required); a non-empty value must match an actual file in the
 * configured directory. If the directory cannot be read, a conservative character
 * allow-list is enforced so traversal/injection characters are still rejected.
 */
const isValidScript = (value: string, dirKey: 'layer2_path' | 'layer3_path'): boolean => {
  if (!value) return true;
  let names: Set<string> | null = null;
  try {
    const dirPath = getPathsConfig()[dirKey];
    names = new Set(fs.readdirSync(dirPath).map((f: string) => path.parse(f).name));
  } catch {
    names = null;
  }
  if (names === null) return /^[A-Za-z0-9._-]+$/.test(value);
  return names.has(value);
};

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
    const name = String(req.params.ssidProfile);
    (await client).connect();
    var collection = (await client).db('gui').collection('ssid_profiles');
    var response = await collection.find({"name": name}).toArray();
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
    
    await deleteDocument(batch_col, 'ssid_profiles', 'ssid_profile_ids', deleted?.name);        // delete references from other collections
    
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
    var collection = (await client).db('gui').collection('ssid_profiles');
    const isDuplicate = await isNameInDB(collection, req.body.name);
    if (isDuplicate) {
      return res.status(400).json({message:"SSID Profile already exists!"});
    }
    const layer2_script = req.body.layer2_script || '';
    const layer3_script = req.body.layer3_script || '';
    if (!layer2_script || !layer3_script) {
      return res.status(400).json({message: "A layer 2 and layer 3 method are both required"});
    }
    if (!isValidScript(layer2_script, 'layer2_path') || !isValidScript(layer3_script, 'layer3_path')) {
      return res.status(400).json({message: "Invalid method selection"});
    }
    await collection.insertOne({
      "name": req.body.name,
      "SSID": req.body.SSID || '',
      "layer2_script": layer2_script,
      "layer3_script": layer3_script
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
    const isDuplicate = await isNameInDB(collection, body.new_ssid_name);
    if (isDuplicate && body.old_ssid_name !== body.new_ssid_name) {
      return res.status(400).json({message:"SSID Profile already exists!"});
    }
    const layer2_script = body.layer2_script || '';
    const layer3_script = body.layer3_script || '';
    if (!layer2_script || !layer3_script) {
      return res.status(400).json({message: "A layer 2 and layer 3 method are both required"});
    }
    if (!isValidScript(layer2_script, 'layer2_path') || !isValidScript(layer3_script, 'layer3_path')) {
      return res.status(400).json({message: "Invalid method selection"});
    }
    await collection.updateOne({
      "name": body.old_ssid_name
    }, {$set:{
         "name": body.new_ssid_name,
         "SSID": body.SSID ?? '',
         "layer2_script": body.layer2_script ?? '',
         "layer3_script": body.layer3_script ?? ''
       }})
    
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
