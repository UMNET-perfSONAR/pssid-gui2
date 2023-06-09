import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
import { updateCollection } from '../services/update.service';
 
var client = connectToMongoDB();

/**
 * Return all schedule information from mongodb 
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const getSchedules = (async (req: Request, res: Response) =>{
    (await client).connect();
    var collection = (await client).db("gui").collection("schedules");
    const schedules = await collection.find().project({_id:0}).toArray();
    res.send(schedules);
})


/**
 * Delete specified schedule from database. schedule to be deleted comes as URL parameter
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const deleteSchedule = (async (req:Request, res:Response) => {
    const name = String(req.params.schedulename);
    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    await collection.findOneAndDelete({ "schedule" : name });
    res.send('schedule ' + name + ' was deleted');
})


/**
 * Creates new schedule entry in database.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const postSchedule = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    collection.insertOne({
        "schedule" : req.body.schedule,
        "repeat" : req.body.repeat
    });
    res.json(req.body);
})

/**
 * Updates schedule with information specified by the user. 
 * Triggers update in batches to ensure up to date information.
 * 
 * @param req - request information from client
 * @param res - response sent back to client 
 */
const updateSchedule = (async (req:Request, res:Response) => {
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
} )

module.exports = {getSchedules, 
                deleteSchedule,
                postSchedule,
                updateSchedule};