import { MongoClient, Db, MongoServerError, Collection } from "mongodb";

// Static json file to get initial batch property options loaded into DB
 export async function connectToMongoDB() {
    const uri = "mongodb://mongo:27017" // instead of localhost:27017, use mongo:27017 as is defined in Docker
    const client = new MongoClient(uri);
    await client.connect();

    await client.db("admin").command({ ping: 1 });
    console.info(`Connected to MongoDB`);
    return client;
}

// create db/collections if DNE
export async function create(client: Promise<MongoClient>, database: string) {
    //var client2 = connectToMongoDB();
    // TODO: CHECK IF DB EXISTS - if DNE, proceed with the following steps 
    (await client).connect();
    var db = (await client).db(database); 


    // does this do anything? If db doesn't exist? Will errror be thrown?
    console.info(db.databaseName);
    // TODO: DO WE WANT COLLECTIONS FOR EACH PROPERTY??? 
    var collectionList = ["schedules", "bssid_scans", "ssid_profiles", "tests", "jobs", "archivers", "batches"];
    collectionList.forEach(function(collectionName) {db.createCollection(collectionName)}); 
}



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