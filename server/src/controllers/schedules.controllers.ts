import express, { Express, Request, Response } from 'express';
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";
import { connectToMongoDB } from '../services/ideas.service';
 
const getSchedules = (async (req: Request, res: Response) =>{
    const uri = "mongodb://mongo:27017/gui" // instead of localhost:27017, use mongo:27017 as is defined in Docker
    const client = new MongoClient(uri);
    await client.connect();
    var collection = await client.db("gui").collection("schedules");
    const specific = await collection.find().toArray();
    console.info(specific);
    res.send(await collection.find().toArray());
})

module.exports = getSchedules;