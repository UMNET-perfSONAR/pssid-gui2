import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection, ObjectId } from "mongodb";
import { connectToMongoDB } from '../services/database.service';
import { get_batch_ids, get_host_ids } from '../services/utility.services';
import { create_config_file } from '../services/config.service';
import { isNameInDB, isValidRfc1123Name, isNameArray, isPlainObjectOrAbsent } from './helpers';

/**
 * Field rules for a host group payload beyond the name. hosts_regex entries
 * are pSSID's own pattern syntax, so only their shape is checked here.
 * Returns an error message, or null when the payload is valid.
 */
const hostGroupFieldError = (body: any): string | null => {
  if (!isNameArray(body.batches)) {
    return "Batches must be a list of batch names";
  }
  if (!Array.isArray(body.hosts) || !body.hosts.every((h: unknown) => typeof h === 'string')) {
    return "Hosts must be a list of host names";
  }
  const regexOk = (r: unknown) => typeof r === 'string' && r.length > 0 && r.length <= 256 && !/[\r\n]/.test(r);
  if (!Array.isArray(body.hosts_regex) || !body.hosts_regex.every(regexOk)) {
    return "Host patterns must be single-line strings";
  }
  if (!isPlainObjectOrAbsent(body.data)) {
    return "Metadata must be an object of key/value pairs";
  }
  return null;
};

var client = connectToMongoDB();

/**
 * Return all host_group information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getHostGroups = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('host_groups');
    const response = await collection.find().project({_id:0}).toArray();
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Get one host_group by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneHostGroup = (async (req: Request, res: Response) => {
  try {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = (await client).db('gui').collection('host_groups');
    var response = await collection.find({"name": host_group}).project({_id:0}).toArray();
    res.send(response); 
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Delete specified host_group from database. host_group to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteHostGroup = (async (req:Request, res:Response) => {
  try {
    const host_group = String(req.params.host_group);
    (await client).connect();
    var collection = (await client).db('gui').collection('host_groups');
    await collection.findOneAndDelete({ "name" : host_group });
    res.send('Host group ' + host_group + ' was deleted!')
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})


/**
 * Creates new host_group entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postHostGroup = (async (req:Request, res:Response) => {
  try {
    if (!isValidRfc1123Name(req.body.name)) {
      return res.status(400).json({message:"Group name must follow host name rules (letters, digits, hyphens)"});
    }
    const fieldError = hostGroupFieldError(req.body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
    (await client).connect();
    var collection = (await client).db('gui').collection('host_groups');
    const isDuplicate = await isNameInDB(collection, req.body.name);
    if (isDuplicate) {
      return res.status(400).json({message:"Group already exists!"});
    }
    var data = req.body;

    await collection.insertOne({
      "name":data.name,
      "batches":data.batches,
      "batch_ids": await get_batch_ids(client, data),
      "hosts": data.hosts,
      "host_ids": await get_host_ids(client, data),
      "hosts_regex": data.hosts_regex,
      "data": data.data
    });

    res.json(data);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Updates host_group with information specified by the user. 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateHostGroup = (async (req:Request, res:Response) => {
  try {
    let data = req.body;
    if (!isValidRfc1123Name(data.new_hostgroup)) {
      return res.status(400).json({message:"Group name must follow host name rules (letters, digits, hyphens)"});
    }
    const fieldError = hostGroupFieldError(data);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
    (await client).connect();
    let collection = (await client).db('gui').collection('host_groups');
    const isDuplicate = await isNameInDB(collection, data.new_hostgroup);
    if (isDuplicate && data.old_hostgroup !== data.new_hostgroup) {
      return res.status(400).json({message:"Group already exists!"});
    }
    // Always recompute the reference ids from the submitted names. This is a
    // handful of indexed lookups, and it self-heals documents whose stored
    // *_ids drifted from the names (an old fast-path bug wrote names into the
    // ids array, which silently broke rename propagation).
    await collection.updateOne({
      "name": data.old_hostgroup
    }, {$set:{"name": data.new_hostgroup, "hosts":data.hosts,
              "hosts_regex": data.hosts_regex,
              "batches": data.batches, "data": data.data,
              "batch_ids": await get_batch_ids(client, req.body),
              "host_ids": await get_host_ids(client, req.body),
             }
       });
    res.json(data);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
} )

const createConfig = (async (req: Request, res: Response) =>{
  try {
    let name = (req.body.length==0)? '*' : req.body.name;
    const oidcUser = (req as any).oidc?.user;
    const caller: string = oidcUser?.sub || oidcUser?.email || 'unauthenticated';
    const caller_role: string = oidcUser ? 'authenticated' : 'unauthenticated';
    await create_config_file(name, 'host_group', caller, caller_role);
    res.send('Config file created');
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})
module.exports = {getHostGroups, 
                  getOneHostGroup, 
                  deleteHostGroup, 
                  postHostGroup, 
                  updateHostGroup,
                  createConfig};
