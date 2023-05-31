import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
 
var client = connectToMongoDB();

// get all schedules 
const getSchedules = (async (req: Request, res: Response) =>{
    (await client).connect();
    var collection = (await client).db("gui").collection("schedules");
    const specific = await collection.find().toArray();
    res.send(await collection.find().toArray());
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
    var data = req.body; 
    collection.insertOne({
        "schedule" : data.schedule,
        "repeat" : data.repeat
    });
    res.json(req.body);
})


// TODO: Add option to provide meta-information 
// completely update one schedule
const updateSchedule = (async (req:Request, res:Response) => {
    const data = req.body;
    const old_schedule = data.old_schedule;
    const new_schedule = data.new_schedule;
    const repeat = data.repeat;

    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    collection.updateOne({
        "schedule": old_schedule
    }, {$set:{"schedule": new_schedule, "repeat": repeat}
     });
    
    res.json(data);
} )


module.exports = {getSchedules, 
                deleteSchedule,
                postSchedule,
                updateSchedule};