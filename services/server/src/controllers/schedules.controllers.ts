import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
 
var client = connectToMongoDB();

// get all schedules 
const getSchedules = (async (req: Request, res: Response) =>{
    (await client).connect();
    var collection = (await client).db("gui").collection("schedules");
    const schedules = await collection.find().project({_id:0}).toArray();
    res.send(schedules);
})


// delete a schedule
const deleteSchedule = (async (req:Request, res:Response) => {
    const name = String(req.params.schedulename);
    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    await collection.findOneAndDelete({ "schedule" : name });
    res.send('schedule ' + name + ' was deleted');
})


// add a single schedule to db 
const postSchedule = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    collection.insertOne({
        "schedule" : req.body.schedule,
        "repeat" : req.body.repeat
    });
    res.json(req.body);
})

// TODO: Add option to provide meta-information 
// completely update one schedule
const updateSchedule = (async (req:Request, res:Response) => {
    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    collection.updateOne({
        "schedule": req.body.old_schedule
    }, {$set:{"schedule": req.body.new_schedule, "repeat":req.body.repeat}
     });
    res.json(req.body);
} )

module.exports = {getSchedules, 
                deleteSchedule,
                postSchedule,
                updateSchedule};