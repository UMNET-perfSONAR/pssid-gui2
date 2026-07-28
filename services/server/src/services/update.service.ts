import { MongoClient } from 'mongodb';

/**
 * Which parallel id array carries the references for a given source collection.
 *
 * A map rather than an if/else chain: the chain's fall-through returned an empty
 * match list, which the caller then wrote back as the name array -- so a
 * collection name nobody had added a branch for would silently WIPE every
 * reference to it instead of failing. An unknown name now throws.
 */
const ID_FIELD: Record<string, string> = {
  hosts: 'host_ids',
  batches: 'batch_ids',
  ssid_profiles: 'ssid_profile_ids',
  schedules: 'schedule_ids',
  jobs: 'job_ids',
  tests: 'test_ids',
};

/**
 * Rebuild a document's (names, ids) reference pair from its id array.
 *
 * Pure, and exported for its tests: this is where the ORDER comes from, and
 * order is load-bearing twice over.
 *
 *  * It is user-visible. A batch runs its jobs in the order they are listed, and
 *    the interface says so. Re-deriving the names in any other order silently
 *    changes what the probe executes.
 *  * The two arrays are matched by INDEX everywhere else -- delete.service.ts
 *    finds a name's position and splices the id at the same position. Let them
 *    drift and deleting one object removes a different object's id, which leaves
 *    a dangling reference and blocks config generation.
 *
 * Both arrays are rebuilt together, in id order, dropping any id whose document
 * no longer exists, so the pair cannot come out of step.
 */
export function alignReferences<T>(
  ids: T[],
  nameById: Map<string, string>
): { names: string[]; ids: T[] } {
  const names: string[] = [];
  const keptIds: T[] = [];
  for (const id of ids) {
    const name = nameById.get(String(id));
    if (name === undefined) continue; // referent is gone; drop the pair
    names.push(name);
    keptIds.push(id);
  }
  return { names, ids: keptIds };
}

/**
 * Refresh the denormalised name arrays in `outdated_col` from the current
 * contents of `truth_col_name` -- for example rewriting every batch's `jobs`
 * after a job is renamed.
 *
 * The ids are the source of truth; the names are a copy kept for the generated
 * config, which the daemon reads by name.
 *
 * @param outdated_col - collection whose name arrays need refreshing (e.g. 'batches')
 * @param truth_col_name - collection the references point at (e.g. 'jobs')
 * @param client - connected MongoClient
 */
export async function updateCollection(
  outdated_col: string,
  truth_col_name: string,
  client: Promise<MongoClient>
) {
  const idField = ID_FIELD[truth_col_name];
  if (!idField) {
    throw new Error(
      `updateCollection: no id field is known for "${truth_col_name}". Add it to ID_FIELD.`
    );
  }

  const db = (await client).db('gui');
  const outdated_collection = db.collection(outdated_col);
  const truth_collection = db.collection(truth_col_name);

  for await (const doc of outdated_collection.find()) {
    const ids = (doc as any)?.[idField];
    // Tolerated rather than fatal, matching delete.service.ts: a document
    // written before ids were tracked has no such field, and `$in: undefined`
    // is a hard MongoDB error ("$in needs an array") that would abort the whole
    // pass over the collection.
    if (!Array.isArray(ids)) continue;

    // find({_id: {$in: [...]}}) returns documents in the collection's natural
    // order, NOT in the order of the array it was given, so this result is a
    // lookup table rather than an ordered list.
    const matched = await truth_collection.find({ _id: { $in: ids } }).toArray();
    const nameById = new Map<string, string>(
      matched.map((d) => [String(d._id), d.name as string])
    );

    const aligned = alignReferences(ids, nameById);

    await outdated_collection.updateOne(
      { _id: doc._id },
      { $set: { [truth_col_name]: aligned.names, [idField]: aligned.ids } }
    );
  }
}
