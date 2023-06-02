// generate a config file from current state of DBs
import { MongoClient } from 'mongodb';
import { connectToMongoDB } from './ideas.service';
const path = './config.json'
const { writeFileSync } = require('fs');

// TODO: Pass in database instance instead of MongoClient? 

// Templated for hosts AND schedules - Not sure if duplicate code is welcomed but can modify later 
async function get_collection(client: MongoClient, col: String) {
    (await client).connect();
    const db = await (await client).db('gui');
    const data = await db.collection(`${col}`).find().project({_id:0}).toArray();
    var host_data = {[`${col}`]:data};
    return host_data;  
}


// serves as "driver" for this project 
export async function create_config_file() {
    const client = await connectToMongoDB();

    var host_data = await get_collection(client, "hosts");
    var schedule_data = await get_collection(client, "schedules");

    var obj = Object.assign(host_data, schedule_data);
  
    try {
    writeFileSync(path, JSON.stringify(obj, null, 2), 'utf8');
    console.log('Data successfully saved to disk');
    } catch (error) {
        console.log('An error has occurred ', error);
    }
    }