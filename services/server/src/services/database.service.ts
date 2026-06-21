import { MongoClient, Db, MongoServerError, Collection } from "mongodb";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://mongo:27017";
let _cachedClient: MongoClient | null = null;

export async function connectToMongoDB() {
  if (_cachedClient) {
    return _cachedClient;
  }
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  console.info(`Connected to MongoDB`);
  _cachedClient = client;
  return client;
}

/**
 * Creates indexes on frequently queried fields to keep queries fast as data grows.
 * Safe to call on every startup — createIndex is idempotent.
 */
export async function ensureIndexes() {
  try {
    const client = await connectToMongoDB();
    const db = client.db('gui');
    const collections = [
      'hosts', 'host_groups', 'batches', 'jobs',
      'schedules', 'ssid_profiles', 'tests'
    ];
    for (const col of collections) {
      await db.collection(col).createIndex({ name: 1 }, { unique: true, sparse: true });
    }
    // Index for fast time-sorted queries on provision history
    await db.collection('provision_history').createIndex({ timestamp: -1 });
    console.info('MongoDB indexes ensured');
  } catch (err) {
    console.error('Failed to ensure MongoDB indexes:', err);
  }
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
