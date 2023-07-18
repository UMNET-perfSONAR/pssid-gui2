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
    try {
        (await client).connect();
        const collection = (await client).db('gui').collection('archivers');
        const response = await collection.find().project({_id:0}).toArray();
        res.send(response);
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
})

/**
 * Get one archiver by 'name'
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getOneArchiver = (async (req: Request, res: Response) => {
    try {
        const name = String(req.params.Archivername);
        (await client).connect();
        var collection = (await client).db('gui').collection('archivers');
        var response = collection.find({"name": name}).toArray();
        res.send(response); 
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
})

/**
 * Delete specified archiver from database. archiver to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteArchiver = (async (req:Request, res:Response) => {
    try {
        const name = String(req.params.archiver_name);
        (await client).connect();
        var archiver_col = (await client).db('gui').collection('archivers');

        var batch_col = (await client).db('gui').collection('batches');

        const deleted = await archiver_col.findOne({ "name" : name });    

        deleteDocument(batch_col, 'archivers', 'archiver_ids', deleted?.name);        // delete references from other collections

        await archiver_col.findOneAndDelete({ "name" : name });       

        res.send('archiver ' + name + ' was deleted')
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
})

/**
 * Creates new archiver entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postArchiver = (async (req:Request, res:Response) => {
    try {
        (await client).connect();
        var collection = (await client).db('gui').collection('archivers');
        collection.insertOne({
            "name": req.body.name,
            "archiver": req.body.archiver,
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
 * Updates archiver with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateArchiver = (async (req:Request, res:Response) => {
    try {
        let body = req.body;
        (await client).connect();
        var collection = (await client).db('gui').collection('archivers');
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
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
})

/**
 * Read archiver option filenames from archiver_options
 * 
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readFileNames = ((req:Request, res:Response) => {
    try {
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
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
})

/**
 * Read selected filename (params.name) from archiver_options - send contents back as a json array 
 * 
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readArchiverFile = ((req:Request, res:Response) => {
    try {
        console.log('reading selected file')

        var name = '../archiver_options/' + req.params.name + '.json'

        const filePath = path.join(__dirname, name);
        var object = JSON.parse(fs.readFileSync(filePath, 'utf-8'));    
        res.json(object);
    }
    catch(error) {
        console.error(error);
        res.status(500).json({message:"Server Error"});
    }
}) 

module.exports = {getArchivers, 
                getOneArchiver, 
                deleteArchiver, 
                postArchiver, 
                updateArchiver,
                readFileNames,
                readArchiverFile};