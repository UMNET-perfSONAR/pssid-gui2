import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all tests
const getTests = (async (req: Request, res: Response) =>{
    (await client).connect();
    const collection = await (await client).db('gui').collection('tests');
    const response = await collection.find().toArray();
    console.log(response);
    res.send(response);
})

// get a single test
const getOneTest = (async (req: Request, res: Response) => {
    const name = String(req.params.testname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('tests');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
})

// delete a single test
const deleteTest = (async (req:Request, res:Response) => {
    const name = String(req.params.testname);
    (await client).connect();
    var collection = await (await client).db('gui').collection('tests');
    await collection.findOneAndDelete({ "name" : name });
    res.send('test ' + name + ' was deleted')
})

// add a single test to db 
const postTest = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('tests');
    collection.insertOne({
        "name":req.body.name,
        "type": req.body.type,
        "spec": req.body.spec
    });   
    res.json(req.body);
})

// TODO: Add option to provide meta-information 
// completely update one test
const updateTest = (async (req:Request, res:Response) => {
    let body = req.body;
    (await client).connect();
    var collection = await (await client).db('gui').collection('tests');
    collection.updateOne({
        "name": body.old_testname
    }, {$set:{"name": body.new_testname, "type": body.type,
              "spec": body.spec},
     })
    if (body.old_testname !== body.new_testname) {      // Trigger update in jobs collection
        updateCollection('jobs', 'tests', client)           // update jobs using tests collection
    }
    res.json(body);
} )
module.exports = {getTests, 
                getOneTest, 
                deleteTest, 
                postTest, 
                updateTest};