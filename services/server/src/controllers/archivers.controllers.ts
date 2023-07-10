import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';
import fs from 'fs';
import path from 'path';
var client = connectToMongoDB();

/**
 * Return all archiver information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getArchivers = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('archivers');
    const response = await collection.find().project({_id:0}).toArray();
    console.log(response);
    res.send(response);
})

/**
 * Get one archiver by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneArchiver = (async (req: Request, res: Response) => {
    const name = String(req.params.Archivername);
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

/**
 * Delete specified archiver from database. archiver to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteArchiver = (async (req:Request, res:Response) => {
    const name = String(req.params.archiver_name);
    (await client).connect();
    var archiver_col = await (await client).db('gui').collection('archivers');

    var batch_col = (await client).db('gui').collection('batches');

    const deleted = await archiver_col.findOne({ "name" : name });    

    deleteDocument(batch_col, 'archivers', 'archiver_ids', deleted?.name);        // delete references from other collections

    await archiver_col.findOneAndDelete({ "name" : name });       

    res.send('archiver ' + name + ' was deleted')
})

/**
 * Creates new archiver entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postArchiver = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    collection.insertOne({
        "name": req.body.name,
        "archiver": req.body.archiver,
        "data": req.body.data
    });   
    res.json(req.body);
})

/**
 * Updates archiver with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateArchiver = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('archivers');
    // Update data - Do in two steps - error otherwise. TODO - Look into shortening this
    collection.updateOne({
        "name": body.old_arc_name
    }, {$set:{"name": body.new_arc_name, "archiver": body.archiver,
              "data": body.data},
    });
    if (body.old_arc_name !== body.new_arc_name) {               // Trigger update in batches collection
        updateCollection('batches', 'archivers', client)       // update batches using ssid_profiles collection
    }
    res.json(body);
})

/**
 * Read archiver option filenames from archiver_options
 * 
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readFileNames = ((req:Request, res:Response) => {
    console.log(__dirname);
    const directoryPath = path.join(__dirname,   '../archiver_options')
    
    fs.readdir(directoryPath, function(err, files) {
        if (err) {
            return console.log('Unable to scan directory:' + err)
        }
        let fileArray: string[] = [];
        files.forEach(function(file) {
            fileArray.push(file.slice(0, -5))
            console.log(file.slice(0, -5));
        })
        res.send(fileArray);
    })
})

/**
 * Read selected filename (params.name) from archiver_options - send contents back as a json array 
 * 
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readArchiverFile = ((req:Request, res:Response) => {
    console.log('reading selected file')

    var name = '../archiver_options/' + req.params.name + '.json'

    const filePath = path.join(__dirname, name);
    var object = JSON.parse(fs.readFileSync(filePath, 'utf-8'));    
    res.json(object);
}) 




module.exports = {getArchivers, 
                getOneArchiver, 
                deleteArchiver, 
                postArchiver, 
                updateArchiver,
                readFileNames,
                readArchiverFile};