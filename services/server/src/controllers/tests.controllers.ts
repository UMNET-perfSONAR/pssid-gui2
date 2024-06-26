import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';
import fs from 'fs';
import path from 'path';
import { isNameInDB } from './helpers';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// Retrieves the path to the tests directory from the paths_config.json file.
const getTestsPath = (): string => {
  const configFile = "../../paths_config.json";
  const configFilePath = path.join(__dirname, configFile);
  var object = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
  return object.tests_path;
};

// get all tests
const getTests = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('tests');
    const response = await collection.find().toArray();
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
    const isDuplicate = await isNameInDB(collection, req.body.name);
    if (isDuplicate) {
      return res.status(400).json({message:"Test already exists!"});
    }
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
    const isDuplicate = await isNameInDB(collection, body.new_testname);
    if (isDuplicate && body.old_testname !== body.new_testname) {
      return res.status(400).json({message:"Test already exists!"});
    }
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
    const directoryPath = getTestsPath();
    
    fs.readdir(directoryPath, function(err, files) {
      if (err) {
        return console.log('Unable to scan directory:' + err)
      }
      let fileArray: string[] = [];
      files.forEach(function(file) {
        fileArray.push(file.slice(0, -5))
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
    const filePath = getTestsPath() + req.params.name + ".json";

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
