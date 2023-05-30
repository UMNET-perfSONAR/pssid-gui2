import { connect } from "http2";
import { MongoClient, Db, MongoServerError, Collection } from "mongodb";


async function connectToMongoDB() {

    const uri = "mongodb://mongo:27017" // instead of localhost:27017, use mongo:27017 as is defined in Docker
    const client = new MongoClient(uri);
    await client.connect();

    await client.db("admin").command({ ping: 1 });
    console.info(`Connected to MongoDB`);
    return client;
}

// add to a designated database - pass in database name?
export async function create(collection: string) {
    // const uri = "mongodb://mongo:27017" // instead of localhost:27017, use mongo:27017 as is defined in Docker
    const client = await connectToMongoDB();
    await client.connect();
    // make database test_col if DNE - arbitrarily add something 
    var colAccess = client.db(collection);
    if ((await colAccess.listCollections().toArray()).includes({name:'test_col'})) {
        (await colAccess.createCollection("test_col")).insertOne({a:1});
    }
    console.info(client.db("blog").collection("test_col").findOne({a:1}));
    
}

// read from a database, pbr string
export async function read(client: MongoClient, collection:&string) {
 
}
/*
async function update() {

}
*/