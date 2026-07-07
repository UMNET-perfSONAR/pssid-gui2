import { MongoClient } from 'mongodb'

/**
 * Maps an array of object names to their MongoDB _ids by looking each name up
 * in the given collection. Every controller stores names (user-facing) plus a
 * parallel *_ids array (stable across renames); this produces the latter.
 *
 * Names are coerced to strings so an operator object in a request body (e.g.
 * {"$ne": null}) can never become a NoSQL query. A missing or non-array input
 * yields [], and unknown names yield undefined entries (the historical
 * behavior callers tolerate).
 */
async function get_ids(client: Promise<MongoClient>, colName: string, names: unknown) {
  const col = (await client).db('gui').collection(colName);
  const list = Array.isArray(names) ? names : [];
  return Promise.all(
    list.map(async (name) => (await col.findOne({ "name": String(name) }))?._id)
  );
}

export const get_ssid_profile_ids = (client: Promise<MongoClient>, data: any) =>
  get_ids(client, 'ssid_profiles', data?.ssid_profiles);

export const get_schedule_ids = (client: Promise<MongoClient>, data: any) =>
  get_ids(client, 'schedules', data?.schedules);

export const get_job_ids = (client: Promise<MongoClient>, data: any) =>
  get_ids(client, 'jobs', data?.jobs);

export const get_test_ids = (client: Promise<MongoClient>, data: any) =>
  get_ids(client, 'tests', data?.tests);

export const get_batch_ids = (client: Promise<MongoClient>, data: any) =>
  get_ids(client, 'batches', data?.batches);

export const get_host_ids = (client: Promise<MongoClient>, data: any) =>
  get_ids(client, 'hosts', data?.hosts);
