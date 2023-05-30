import express, { Express, Request, Response } from 'express';

const getJobs = ((req: Request, res: Response) =>{
    res.send("This is the jobs request from controller!!");
})

module.exports = getJobs;