import { Collection, FindCursor, MongoClient, WithId } from 'mongodb';
/**
 * Iteratively "deletes" object that is referenced in other collections
 * Called in an HTTP DELETE request
 *   
 * @param outdated_collection - Collection that requires updating (i.e. host_groups if a host is deleted)
 * @param truth_col_name - Collection name of deleted item
 * @param name_ids - <collection>_ids - Templated to match singluar vs. plural of 'es' vs. 's'
 * @param deleted_item - Name of deleted item from source-of-truth collection. Item deleted in DELETE request
 */

export async function deleteDocument(outdated_collection:&Collection, truth_col_name:&string, name_ids:&string, deleted_item:&string) {
  const allOutdatedDocs = outdated_collection.find();
  
  for await (const outdated_col_doc of allOutdatedDocs) {

    const index = await outdated_col_doc?.[`${truth_col_name}`].indexOf(deleted_item);
    
    // if deleted item in array, remove item and _id from respective arrays
    if (index > -1) {              
      await outdated_col_doc?.[`${truth_col_name}`].splice(index, 1);
      await outdated_col_doc?.[`${name_ids}`].splice(index, 1);
      await outdated_collection.updateOne({
        "name": outdated_col_doc.name,
      }, {$set: {[`${truth_col_name}`]: await outdated_col_doc?.[`${truth_col_name}`],
                 [`${name_ids}`]: await outdated_col_doc?.[`${name_ids}`]}
          
         })
    }
  }
}
