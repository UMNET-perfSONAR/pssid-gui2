import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';
import fs from 'fs';
import path from 'path';
import { isNameInDB, isValidObjectName } from './helpers';

// TODO: Scope of client variable - Import from another module?
var client = connectToMongoDB();

// Retrieves the path to the tests directory from the paths_config.json file.
const getTestsPath = (): string => {
  const configFile = "../../paths_config.json";
  const configFilePath = path.join(__dirname, configFile);
  var object = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
  return object.tests_path;
};

/**
 * A test's type must name an installed pScheduler test template (a .json file
 * in the tests directory), since the template defines the spec fields the
 * daemon expects. If the directory cannot be read, fall back to a
 * conservative character allow-list so traversal characters are still
 * rejected.
 */
const isValidTestType = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value) || value.includes('..')) {
    return false;
  }
  try {
    const names = fs.readdirSync(getTestsPath())
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.parse(f).name);
    return names.includes(value);
  } catch {
    return true;
  }
};

/**
 * A single spec field entry, checked against the same shapes
 * `formatTestSpec` (config.service.ts) accepts when the config file is
 * generated - so a bad shape is rejected here, at save time, rather than
 * surfacing later as a config-generation error.
 */
const specElementError = (element: any): string | null => {
  if (element.type === 'singleselect') {
    if (!element.selected || typeof element.selected.name === 'undefined') {
      return `Field "${element.name}" has no value selected`;
    }
    return null;
  }
  if (element.type === 'multiselect') {
    return `Field "${element.name}" is a multiselect, which is not allowed in test specs`;
  }
  if (!element.hasOwnProperty('type')) {
    if (!element.hasOwnProperty('key') || !element.hasOwnProperty('value')) {
      return "Optional data entries must have a key and a value";
    }
  }
  return null;
};

/**
 * Field rules for a test payload beyond the name: a known template type and
 * a spec in the shape the dynamic form produces (an array of field entries).
 */
const testFieldError = (body: any): string | null => {
  if (!isValidTestType(body.type)) {
    return "Unknown test type";
  }
  if (!Array.isArray(body.spec)) {
    return "Test options must be a list of fields";
  }
  for (const element of body.spec) {
    const error = specElementError(element);
    if (error) return error;
  }
  return null;
};

// get all tests
const getTests = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    const collection = (await client).db('gui').collection('tests');
    const response = await collection.find().project({_id:0}).toArray();
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
    var response = await collection.find({"name": name}).project({_id:0}).toArray();
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
    await deleteDocument(job_col, 'tests', 'test_ids', deleted?.name);        // delete references from other collections
    
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
    if (!isValidObjectName(req.body.name)) {
      return res.status(400).json({message:"Invalid test name"});
    }
    const fieldError = testFieldError(req.body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
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
    if (!isValidObjectName(body.new_testname)) {
      return res.status(400).json({message:"Invalid test name"});
    }
    const fieldError = testFieldError(body);
    if (fieldError) {
      return res.status(400).json({message: fieldError});
    }
    (await client).connect();
    var collection = (await client).db('gui').collection('tests');
    const isDuplicate = await isNameInDB(collection, body.new_testname);
    if (isDuplicate && body.old_testname !== body.new_testname) {
      return res.status(400).json({message:"Test already exists!"});
    }
    await collection.updateOne({
      // String-coerce so an operator object can't turn this filter into a
      // NoSQL query targeting an arbitrary document (new_testname is checked).
      "name": String(body.old_testname)
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
        // A missing/unreadable directory means no templates are installed. That
        // is a valid state: answer with an empty list. (Returning without a
        // response here used to hang the request until the proxy gave up.)
        console.warn('Unable to scan test templates directory: ' + err);
        return res.json([]);
      }
      // Only .json files are templates; anything else in the directory (editor
      // backups, hidden files) must not appear as a selectable test type.
      const fileArray = files
        .filter((file) => file.endsWith('.json'))
        .map((file) => path.parse(file).name);
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
    const directoryPath = getTestsPath();
    // Strip any directory components so the request cannot escape the tests
    // directory via path traversal (e.g. "../../etc/passwd").
    const safeName = path.basename(String(req.params.name));
    const filePath = path.resolve(directoryPath, safeName + ".json");
    if (!filePath.startsWith(path.resolve(directoryPath) + path.sep)) {
      return res.status(400).json({message:"Invalid file name"});
    }

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
