import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/database.service';
import { updateCollection } from '../services/update.service';
import { deleteDocument } from '../services/delete.service';

var client = connectToMongoDB();

/**
 * Return all schedule information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getSchedules = (async (req: Request, res: Response) =>{
  try {
    (await client).connect();
    var collection = (await client).db("gui").collection("schedules");
    const schedules = await collection.find().project({_id:0}).toArray();
    res.send(schedules);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }

})


/**
 * Delete specified schedule from database. schedule to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteSchedule = (async (req:Request, res:Response) => {
  try {
    const name = String(req.params.schedulename);
    (await client).connect();
    const schedule_col = (await client).db('gui').collection('schedules');
    const batch_col = (await client).db('gui').collection('batches');

    const deleted = await schedule_col.findOne({ "name" : name });    

    deleteDocument(batch_col, 'schedules', 'schedule_ids', deleted?.name);        // delete references from other collections

    await schedule_col.findOneAndDelete({ "name" : name });       

    res.send('schedule ' + name + ' was deleted');
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})


/**
 * Creates new schedule entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postSchedule = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    var collection = (await client).db('gui').collection('schedules');
    collection.insertOne({
      "name" : req.body.name,
      "repeat" : req.body.repeat
    });
    res.json(req.body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
})

/**
 * Updates schedule with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateSchedule = (async (req:Request, res:Response) => {
  try {
    (await client).connect();
    var collection = (await client).db('gui').collection('schedules');
    await collection.updateOne({
      "name": req.body.old_schedule
    }, {$set:{"name": req.body.new_schedule, "repeat":req.body.repeat}
       });
    
    if (req.body.old_schedule !== req.body.new_schedule) {      // Trigger update in batches collection
      await updateCollection('batches', 'schedules', client);        // update batches using schedules collection
    }
    
    res.json(req.body);
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message:"Server Error"});
  }
} )

module.exports = {getSchedules, 
                  deleteSchedule,
                  postSchedule,
                  updateSchedule};
