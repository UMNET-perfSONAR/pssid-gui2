import { MongoClient, Db, MongoServerError, Collection } from "mongodb";

export async function connectToMongoDB() {

    const uri = "mongodb://mongo:27017" // instead of localhost:27017, use mongo:27017 as is defined in Docker
    const client = new MongoClient(uri);
    await client.connect();

    //await client.db("admin").command({ ping: 1 });
    console.info(`Connected to MongoDB`);
}

async function applySchemaValidation(database: Db, collection: string, schema: Object) {
    await database.command({
        collMod: collection,
        validator: schema
    })
    .catch(async (error: MongoServerError) => {
        const { codeName } = error;
        if (codeName === 'NamespaceNotFound') {
            await database.createCollection(
                collection, {
                    validator: schema
                }
            )
        }
    });
}
