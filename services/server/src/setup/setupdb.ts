// Run this script while connected to MongoDB
import { connectToMongoDB } from '../services/ideas.service';
import { MongoClient, Db, MongoServerError, Collection, MongoDBNamespace } from "mongodb";
//import { schedules } from './schedules';

export async function startup() {
    // connect to db
    var client = connectToMongoDB();
    (await client).connect();
    console.log("Connected to MongoDB. Beginning setup now...");
    (await client).db('gui').dropDatabase();
    var db = (await client).db('gui');

    // create relevant collections 
    var collectionList = ["schedules", "ssid_profiles", "tests", "jobs", "archivers", "batches", "hosts", "host_groups"];
    collectionList.forEach(function(collectionName) {db.createCollection(collectionName)}); 
    

    // when this returns, should be able to convert json array -> json object -> correct formatting 
    db.collection('schedules').insertMany([
        {"name":"schedule_every_1_min",
         "repeat": "*/1 * * * *"
        },
        {"name":"schedule_every_5_min",
         "repeat":"*/5 * * * *"
        }])

    db.collection('hosts').insertMany([
        {"name":"rp1",
         "batches": [],
         "data": []
        },
        {"name":"rp2",
         "batches": [],
         "data": [] 
        }
    ])

    db.collection('host_groups').insertMany([
        {
            "name": "chem_building",
            "hosts": ["rp1", "rp1"],
            "batches": ["batch_2", "my_batch"],
            "data": []
        },
        {
            "name": "lsa_building",
            "hosts": ["rp1"], 
            "batches": ["all_batches"],
            "data": []
        }
    ])
}
