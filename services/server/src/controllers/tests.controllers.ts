import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';
import fs from 'fs';
import path from 'path';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// get all tests
const getTests = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('tests');
    const response = await collection.find().toArray();
    console.log('tests')
    res.send(response);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }

})

// get a single test
const getOneTest = (async (req: Request, res: Response) => {
  try {
    const name = String(req.params.testname);
    (await client).connect();
    var collection = (await client).db('gui').collection('tests');
    var response = collection.find({"name": name}).toArray();
    res.send(response); 
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
  
})

// delete a single test
const deleteTest = (async (req:Request, res:Response) => {
  try {
    const name = String(req.params.testname);
    (await client).connect();
    var test_col = (await client).db('gui').collection('tests');
    var job_col = (await client).db('gui').collection('jobs');
    
    const deleted = await test_col.findOne({ "name" : name });    
    deleteDocument(job_col, 'tests', 'test_ids', deleted?.name);        // delete references from other collections
    
    await test_col.findOneAndDelete({ "name" : name });       
    
    res.send('test ' + name + ' was deleted')
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

// add a single test to db 
const postTest = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    var collection = (await client).db('gui').collection('tests');
    console.log('test insetion')
    await collection.insertOne({
      "name":req.body.name,
      "type": req.body.type,
      "spec": req.body.spec
    });   
    res.json(req.body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

// TODO: Add option to provide meta-information 
// completely update one test
const updateTest = (async (req:Request, res:Response) => {
  try {
    let body = req.body;
    (await client).connect();
    var collection = (await client).db('gui').collection('tests');
    await collection.updateOne({
      "name": body.old_testname
    }, {$set:{"name": body.new_testname, "type": body.type,
              "spec": body.spec},
       })
    if (body.old_testname !== body.new_testname) {                // Trigger update in jobs collection
      await updateCollection('jobs', 'tests', client)           // update jobs using tests collection
    }
    res.json(body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Read test option filenames from test_options
 * 
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readFileNames = ((req:Request, res:Response) => {
  try {
    console.log(__dirname);
    const directoryPath = path.join(__dirname,   '../test_options')
    
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
 * Read selected filename (params.name) from test_options - send contents back as a json array 
 * 
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readTestFile = ((req:Request, res:Response) => {
  try {
    console.log('reading selected file')

    var name = '../test_options/' + req.params.name + '.json'
    
    const filePath = path.join(__dirname, name);
    var object = JSON.parse(fs.readFileSync(filePath, 'utf-8'));    
    res.json(object);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
}) 

module.exports = {getTests, 
                  getOneTest, 
                  deleteTest, 
                  postTest, 
                  updateTest, 
                  readFileNames,
                  readTestFile};
