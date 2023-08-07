"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startup = void 0;
// Run this script while connected to MongoDB
const database_service_1 = require("../services/database.service");
function startup() {
    return __awaiter(this, void 0, void 0, function* () {
        // connect to db 
        var client = (0, database_service_1.connectToMongoDB)();
        (yield client).connect();
        console.log("Connected to MongoDB. Beginning setup now...");
        (yield client).db('gui').dropDatabase();
        var db = (yield client).db('gui');
        // create relevant collections 
        var collectionList = ["schedules", "ssid_profiles", "tests", "jobs", "archivers", "batches", "hosts", "host_groups"];
        collectionList.forEach(function (collectionName) { db.createCollection(collectionName); });
        // when this returns, should be able to convert json array -> json object -> correct formatting 
        db.collection('schedules').insertMany([
            { "name": "schedule_every_1_min",
                "repeat": "*/1 * * * *"
            },
            { "name": "schedule_every_5_min",
                "repeat": "*/5 * * * *"
            }
        ]);
        db.collection('hosts').insertMany([
            { "name": "rp1",
                "batches": [],
                "batch_ids": [],
                "data": []
            },
            { "name": "rp2",
                "batches": [],
                "batch_ids": [],
                "data": []
            },
            { "name": "rp3",
                "batches": [],
                "batch_ids": [],
                "data": []
            }
        ]);
        db.collection('archivers').insertOne({
            "name": "example_rabbitmq_archive",
            "archiver": "rabbitmq",
            "data": {
                "_url": "amqp://elastic:elastic@pssid-elk.miserver.it.umich.edu",
                "routing-key": "pscheduler_raw"
            }
        });
        db.collection('ssid_profiles').insertOne({
            "name": "MWireless_profile",
            "SSID": "MWireless",
            "min_signal": -73
        });
        db.collection('tests').insertOne({
            "name": "http-google",
            "type": "http",
            "spec": {
                "url": "www.google.com"
            }
        });
        db.collection('jobs').insertOne({
            "name": "layer-2-auth",
            "parallel": true,
            "test_ids": [],
            "tests": [],
            "continue_if": true
        });
    });
}
exports.startup = startup;
