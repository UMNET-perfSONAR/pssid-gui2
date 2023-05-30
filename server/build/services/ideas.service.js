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
exports.create = exports.connectToMongoDB = void 0;
const mongodb_1 = require("mongodb");
// Static json file to get initial batch property options loaded into DB
function connectToMongoDB() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = "mongodb://mongo:27017"; // instead of localhost:27017, use mongo:27017 as is defined in Docker
        const client = new mongodb_1.MongoClient(uri);
        yield client.connect();
        yield client.db("admin").command({ ping: 1 });
        console.info(`Connected to MongoDB`);
        return client;
    });
}
exports.connectToMongoDB = connectToMongoDB;
// create db/collections if DNE
function create(client, database) {
    return __awaiter(this, void 0, void 0, function* () {
        //var client2 = connectToMongoDB();
        // TODO: CHECK IF DB EXISTS - if DNE, proceed with the following steps 
        (yield client).connect();
        var db = (yield client).db(database);
        // does this do anything? If db doesn't exist? Will errror be thrown?
        console.info(db.databaseName);
        // TODO: DO WE WANT COLLECTIONS FOR EACH PROPERTY??? 
        var collectionList = ["schedules", "bssid_scans", "ssid_profiles", "tests", "jobs", "archivers", "batches"];
        collectionList.forEach(function (collectionName) { db.createCollection(collectionName); });
    });
}
exports.create = create;
// Allow editing/updating/addition of properties 
/* Separate functions for this may include:
    Edit <property>
    Add <property>
    Delete <property>

    Could potentially template some of these functions???
*/
// Batch manipulation 
/* Frontend - diff file:
    View previous GUI
    Separate page?
        Select existing batch OR make a new batch
                                 select all relevant properties
        Submit

    Backend:
        If new batch - add batch to collection

*/
/* Deployment/Sending tests
    Frontend:
        User selects batches/host(s) or host group(s)
        Submits
    
    Backend:
        Add batch(es) to host/host group collections???

*/ 
