import { Collection } from 'mongodb';

/**
 * Removes references to a deleted object from every document in another
 * collection. Called from HTTP DELETE handlers, for example: deleting a batch
 * must remove that batch name (and its id) from every host and host group that
 * referenced it, so the generated config never contains dangling names.
 *
 * Documents that do not carry the reference array at all are skipped: not every
 * document references every collection (batches created in the GUI have no
 * archivers field, for instance), and a missing parallel *_ids array is
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

    const index = names.indexOf(deleted_item);
    if (index === -1) continue;

    names.splice(index, 1);
    const update: Record<string, unknown> = { [truth_col_name]: names };

    const ids = doc?.[name_ids];
    if (Array.isArray(ids) && index < ids.length) {
      ids.splice(index, 1);
      update[name_ids] = ids;
    }

    await outdated_collection.updateOne({ name: doc.name }, { $set: update });
  }
}
