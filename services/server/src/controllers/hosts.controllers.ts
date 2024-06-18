import express, { Express, NextFunction, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { get_batch_ids } from '../services/utility.services';
import { deleteDocument } from '../services/delete.service';
import { create_config_file } from '../services/config.service';
import { isNameInDB } from './helpers';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

/** 
 * Return all host information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getHosts = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('hosts');
    const response = await collection.find().toArray();
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Get one host by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneHost = (async (req: Request, res: Response) => {
  try {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    var response = collection.find({"name": name}).toArray();
    res.send(response);  
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Delete specified host from database. host to be deleted comes as URL parameter
 * 
 * TODO - Compress to one lookup (findOneAndDelete)
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteHost = (async (req:Request, res:Response) => {
  try {
    const name = String(req.params.hostname);
    (await client).connect();
    var hosts_col = (await client).db('gui').collection('hosts');
    const deleted = await hosts_col.findOne({ "name" : name });
    var host_groups_col = (await client).db('gui').collection('host_groups');

    // Delete references from other collections
    await deleteDocument(host_groups_col, 'hosts', 'host_ids', deleted?.name);
    // Remove from collection
    await hosts_col.findOneAndDelete({ "name" : name });

    res.send('host ' + name + ' was deleted')
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})


const deleteAll = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    var hosts_col = (await client).db('gui').collection('hosts');

    // TODO: UPDATE HOST_GROUPS
    hosts_col.deleteMany({});

    res.send('all hosts were deleted')
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Creates new host entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postHost = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    const isDuplicate = await isNameInDB(collection, req.body.name);
    if (isDuplicate) {
      return res.status(400).json({message: "Host already exists!"});
    }
    let batch_ids = await get_batch_ids(client, req.body);
    await collection.insertOne({
      "name":req.body.name,
      "batches": req.body.batches,
      "batch_ids": batch_ids,
      "data": req.body.data
    });   
    res.json(req.body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Updates host with information specified by the user. 
 * Triggers update in host_groups to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateHost = (async (req:Request, res:Response) => {
  try {
    let body = req.body;
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    const isDuplicate = await isNameInDB(collection, req.body.new_hostname);
    if (isDuplicate && req.body.new_hostname !== req.body.old_hostname) {
      return res.status(400).json({message: "Host already exists!"});
    }
    let doc = await collection.findOne({name: req.body.old_hostname});
    await collection.updateOne({
      "name": body.old_hostname
    }, {$set:{"name": body.new_hostname, "batches": body.batches,
              "batch_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc?.batches)) ?     // update reference _ids if changes made 
      doc?.batches: await get_batch_ids(client, req.body),
              "data": body.data},
       });
    if (body.new_hostname !== body.old_hostname) {            // Trigger update in hosts
      await updateCollection('host_groups', 'hosts', client);      // update host_groups using hosts collection
    }
    res.json(body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
} )

const createConfig = (async (req: Request, res: Response) =>{
  try {  
    let name = (req.body.length==0)? '*' : req.body.name;
    await create_config_file(name, 'host');
    res.send('Config file created');
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

module.exports = {getHosts, 
                  getOneHost, 
                  deleteHost, 
                  postHost, 
                  deleteAll,
                  updateHost,
                  createConfig};
