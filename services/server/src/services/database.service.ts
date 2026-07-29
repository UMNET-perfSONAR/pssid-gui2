import { MongoClient, Db, MongoServerError, Collection } from "mongodb";

// The in-flight or settled connection, NOT the resolved client.
//
// Caching the resolved client looks equivalent and is not. Every controller
// module runs `var client = connectToMongoDB()` at import time, so all seven
// call this before any of them finishes: each one found the cache still empty
// (it is only filled after `await client.connect()`) and built a MongoClient of
// its own. Seven clients, each with its own pool -- up to 700 connections to a
// MongoDB whose driver default is 100 per client -- and the cache the code was
// written to provide never took effect for a single controller.
//
// Storing the PROMISE closes the window: the second caller gets the first
// caller's pending connection instead of starting a second one.
let _clientPromise: Promise<MongoClient> | null = null;

export function connectToMongoDB(): Promise<MongoClient> {
  if (_clientPromise) return _clientPromise;

  _clientPromise = (async () => {
    // Read the URI here, not at module load. index.ts imports this module before
    // it calls dotenv.config(), so a module-level constant would capture the
    // credential-less default before services/server/.env is loaded. The server
    // would then connect to an auth-enabled MongoDB unauthenticated, and every
    // find/insert would fail with "Command requires authentication" (code 13)
    // while connect/ping (which need no auth) still succeed.
    const MONGO_URI = process.env.MONGODB_URI || "mongodb://mongo:27017";
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.info(`Connected to MongoDB`);
    return client;
  })();

  // A failed attempt must not be cached, or one unlucky startup (MongoDB still
  // coming up in its own container) would leave every later call rejecting
  // against a connection that was never retried.
  _clientPromise.catch(() => { _clientPromise = null; });

  return _clientPromise;
}

/**
 * Creates indexes on frequently queried fields to keep queries fast as data grows.
 * Safe to call on every startup, createIndex is idempotent.
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
