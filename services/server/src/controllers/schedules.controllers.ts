import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
 
var client = connectToMongoDB();

// get all schedules 
const getSchedules = (async (req: Request, res: Response) =>{
    (await client).connect();
    var collection = (await client).db("gui").collection("schedules");
    const schedules = await collection.find().project({_id:0, "schedule":0}).toArray();
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
    const data = req.body; 
    const schedule_name = `${data.schedule}`

    var collection = await (await client).db('gui').collection('schedules');
    collection.insertOne({
        "schedule" : data.schedule,
        [schedule_name] : {
            "repeat" : data.repeat
        }
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

    const old_sched_ref = `${old_schedule}`;

    (await client).connect();
    var collection = await (await client).db('gui').collection('schedules');
    collection.updateOne({
        "schedule": old_schedule
    }, {$set:{"schedule": new_schedule, [old_sched_ref+".repeat"]:repeat}
     });

    collection.updateOne({
        "schedule": new_schedule
     }, { $rename:{[old_sched_ref]:new_schedule}
     })
    
    res.json(data);
} )


module.exports = {getSchedules, 
                deleteSchedule,
                postSchedule,
                updateSchedule};