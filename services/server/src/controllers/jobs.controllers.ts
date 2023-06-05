import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all jobs
const getJobs = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('jobs');
    const response = await collection.find().project({_id:0}).toArray();
    console.log(response);
    res.send(response);
})

// get a single host
const getOneJob = (async (req: Request, res: Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('jobs');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

// delete a single host
const deleteJob = (async (req:Request, res:Response) => {
    const name = String(req.params.hostname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('jobs');
    await collection.findOneAndDelete({ "name" : name });
    res.send('host ' + name + ' was deleted')
})

// add a single host to db 
const postJob = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('jobs');
    collection.insertOne({
        "name":req.body.name,
        "parallel": req.body.parallel,
        "tests": req.body.tests,
        "continue-if": req.body.continue_if
    });   
    res.json(req.body);
})

// TODO: Add option to provide meta-information 
// completely update one host
const updateJob = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('jobs');
    collection.updateOne({
        "name": body.old_job
    }, {$set:{"name": body.new_job, "parallel": body.parallel, "tests": body.tests,
              "continue-if": body.continue_if},
     })
    res.json(body);
} )
module.exports = {getJobs, 
                getOneJob, 
                deleteJob, 
                postJob, 
                updateJob};