import { Collection } from 'mongodb';

/**
 * Removes references to a deleted object from every document in another
 * collection. Called from HTTP DELETE handlers, for example: deleting a batch
 * must remove that batch name (and its id) from every host and host group that
 * referenced it, so the generated config never contains dangling names.
 *
 * Documents that do not carry the reference array at all are skipped: not every
 * document references every collection, and a missing parallel *_ids array is
 * tolerated for documents written before ids were tracked.
 *
 * @param outdated_collection - collection to scrub (e.g. host_groups when a host is deleted)
 * @param truth_col_name - name of the reference array field (e.g. 'hosts')
 * @param name_ids - name of the parallel id array field (e.g. 'host_ids')
 * @param deleted_item - name of the object that was deleted
 */
export async function deleteDocument(
  outdated_collection: Collection,
  truth_col_name: string,
  name_ids: string,
  deleted_item: string
) {
  const allOutdatedDocs = outdated_collection.find();

  for await (const doc of allOutdatedDocs) {
    const names = doc?.[truth_col_name];
    if (!Array.isArray(names)) continue;
    if (!names.includes(deleted_item)) continue;

    const ids = doc?.[name_ids];
    const haveIds = Array.isArray(ids) && ids.length === names.length;

    // Rebuild both arrays in one pass, dropping EVERY occurrence.
    //
    // Removing only the first (indexOf + splice) left a second reference to the
    // same object behind whenever a document legitimately listed it twice -- a
    // batch that runs one job twice, say -- and that leftover name is a dangling
    // reference, which blocks config generation for the whole deployment.
    //
    // The ids array is only touched when it is exactly as long as the names, so
    // the index correspondence the two arrays rely on is known to hold. A
    // shorter or absent one is left alone rather than spliced at an index that
    // means nothing in it (see update.service.ts, which keeps the pair aligned).
    const keptNames: unknown[] = [];
    const keptIds: unknown[] = [];
    names.forEach((name: unknown, i: number) => {
      if (name === deleted_item) return;
      keptNames.push(name);
      if (haveIds) keptIds.push(ids[i]);
    });

    const update: Record<string, unknown> = { [truth_col_name]: keptNames };
    if (haveIds) update[name_ids] = keptIds;

    // By _id rather than by name. A unique sparse index on `name` does exist on
    // every one of these collections, so matching by name is not ambiguous
    // today -- but _id is the key this document was just read by, it cannot be
    // edited, and it needs no index to stay correct. update.service.ts writes
    // through _id for the same reason.
    await outdated_collection.updateOne({ _id: doc._id }, { $set: update });
  }
}
