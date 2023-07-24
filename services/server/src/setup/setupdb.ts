// Run this script while connected to MongoDB
import { connectToMongoDB } from '../services/ideas.service';
import { MongoClient, Db, MongoServerError, Collection, MongoDBNamespace } from "mongodb";

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
        }]);

    db.collection('hosts').insertMany([
        {"name":"rp1",
         "batches": [],
         "batch_ids": [],
         "data": []
        },
        {"name":"rp2",
         "batches": [],
         "batch_ids": [],
         "data": [] 
        },
        {"name":"rp3",
        "batches": [],
        "batch_ids": [],
        "data": [] 
        }

    ]);
    db.collection('archivers').insertOne(
        {
            "name": "example_rabbitmq_archive",
            "archiver": "rabbitmq",
            "data": {
                "_url": "amqp://elastic:elastic@pssid-elk.miserver.it.umich.edu",
                "routing-key": "pscheduler_raw"  
            }
        }
    );
    db.collection('ssid_profiles').insertOne(
        {
            "name": "MWireless_profile",
            "SSID": "MWireless",
            "min_signal": -73
        }
    );
    db.collection('tests').insertOne(
        {
            "name": "http-google",
            "type": "http",
            "spec": {
                "url": "www.google.com"
            }
        }
    )

    db.collection('jobs').insertOne(
        {
            "name": "layer-2-auth",
            "parallel": true,
            "test_ids":[],
            "tests": [],
            "continue_if": true
        }
    )
}
