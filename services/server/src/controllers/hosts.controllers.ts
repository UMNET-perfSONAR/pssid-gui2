import express, { Express, NextFunction, Request, Response } from 'express';
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { get_batch_ids } from '../services/utility.services';
import { deleteDocument } from '../services/delete.service';
import { create_config_file, build_host_view } from '../services/config.service';
import { isNameInDB, isValidHostEntry, isNameArray, isPlainObjectOrAbsent } from './helpers';

/**
 * Field rules for a host payload beyond the name. Returns an error message,
 * or null when the payload is valid.
 */
const hostFieldError = (body: any): string | null => {
  if (!isNameArray(body.batches)) {
    return "Batches must be a list of batch names";
  }
  if (!isPlainObjectOrAbsent(body.data)) {
    return "Metadata must be an object of key/value pairs";
  }
  return null;
};

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
    const response = await collection.find().project({_id:0}).toArray();
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
    var response = await collection.find({"name": name}).project({_id:0}).toArray();
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
    var host_groups_col = (await client).db('gui').collection('host_groups');

    await hosts_col.deleteMany({});
    // Clear now-dangling host references so host groups don't point at deleted hosts.
    await host_groups_col.updateMany({}, { $set: { hosts: [], host_ids: [] } });

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
    if (!isValidHostEntry(req.body.name)) {
      return res.status(400).json({message: "Host must be a valid host name or IP address"});
    }
    const fieldError = hostFieldError(req.body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
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
    if (!isValidHostEntry(body.new_hostname)) {
      return res.status(400).json({message: "Host must be a valid host name or IP address"});
    }
    const fieldError = hostFieldError(body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
    (await client).connect();
    var collection = (await client).db('gui').collection('hosts');
    const isDuplicate = await isNameInDB(collection, req.body.new_hostname);
    if (isDuplicate && req.body.new_hostname !== req.body.old_hostname) {
      return res.status(400).json({message: "Host already exists!"});
    }
    // Always recompute the reference ids from the submitted names. This is a
    // handful of indexed lookups, and it self-heals documents whose stored
    // *_ids drifted from the names (an old fast-path bug wrote names into the
    // ids array, which silently broke rename propagation).
    await collection.updateOne({
      // Coerce to a string so an operator object in old_hostname (e.g.
      // {"$ne": null}) can't turn this filter into a NoSQL query that
      // rewrites an arbitrary document. new_hostname is already string-checked.
      "name": String(body.old_hostname)
    }, {$set:{"name": body.new_hostname, "batches": body.batches,
              "batch_ids": await get_batch_ids(client, req.body),
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

/**
 * The effective configuration of one probe: metadata, group memberships, and
 * the fully-expanded batches it will run, sliced from the same payload the
 * daemon receives. 422 when the database holds data the daemon would reject
 * (the error message lists the problems).
 */
const getHostConfig = (async (req: Request, res: Response) => {
  try {
    const name = String(req.params.hostname);
    const view = await build_host_view(name);
    if (view === null) {
      return res.status(404).json({message: "Host not found"});
    }
    res.json(view);
  }
  catch(error) {
    if (error instanceof Error && error.message.startsWith('Config validation failed')) {
      return res.status(422).json({message: error.message});
    }
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

const createConfig = (async (req: Request, res: Response) =>{
  try {
    let name = (req.body.length==0)? '*' : req.body.name;
    const oidcUser = (req as any).oidc?.user;
    const caller: string = oidcUser?.sub || oidcUser?.email || 'unauthenticated';
    const caller_role: string = oidcUser ? 'authenticated' : 'unauthenticated';
    await create_config_file(name, 'host', caller, caller_role);
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
                  createConfig,
                  getHostConfig};
