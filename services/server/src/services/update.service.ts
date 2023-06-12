import { Collection, FindCursor, MongoClient, WithId } from 'mongodb';

/**
 * Updates the "outdated" collection to match the changes made in corresponding source-of-truth collection
 *      i.e update host_groups collection when a document in hosts collection is updated to maintain consistency
 * 
 * @param truth_col_name_name - name of collection serving as source of truth
 * @param outdated_col_name - name of collection that requires updating 
 * @param client - MongoClient instance connected to localhost://21707 
 * 
 */
// constructed/modified core logic based off of https://chat.openai.com/chat - citation needed?
export async function updateCollection(outdated_col: string, truth_col_name:string, client:Promise<MongoClient>) {
    const  outdated_collection = (await client).db('gui').collection(outdated_col);
    const truth_collection = (await client).db('gui').collection(truth_col_name);

    const allOutdatedDocs = outdated_collection.find();
    for await (const outdated_col_doc of allOutdatedDocs) {
        var matched_items = item(outdated_col_doc, truth_collection, truth_col_name);

        const item_names = (await matched_items).map((host: { name: string; }) => host.name);     // extract hostname values 
        console.log(item_names); 
        await outdated_collection.updateOne(                        // update item_names for each document
            {_id: outdated_col_doc._id},          
            {$set: { [`${truth_col_name}`]:  item_names}}
        )
    }
    console.log(`updated ${outdated_col} collection`); 
}
/**
 * Enables templating of updateCollection() function above.
 *      Returns the matched documents between the current outdated document and the truth collection based off of _id
 * 
 * TODO: Determine if there is a better/more efficient way to do this 
 * 
 * @param outdated_col_doc - Current document we are iterating over
 * @param truth_collection - Reference to collection we are using as "source-of-truth"
 * @param truth_col_name - Name of source of truth collection
 * 
 */
async function item (outdated_col_doc: &any, truth_collection: &Collection, truth_col_name:string) {
    var matched_items: any[] = [];
        if (truth_col_name === 'hosts') {
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.hosts_ids}}).toArray();
        }
        else if (truth_col_name === 'batches') {
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.batch_ids}}).toArray();
        }
        else if (truth_col_name === 'ssid_profiles') {
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.ssid_profile_ids}}).toArray();
        }
        else if (truth_col_name === 'archivers') {
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.archiver_ids}}).toArray();
        }
        else if (truth_col_name === 'schedules') {
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.schedule_ids}}).toArray();
            console.log(matched_items);
        }
        else if (truth_col_name === 'jobs') {
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.job_ids}}).toArray();
        }
        else if (truth_col_name === 'tests') {
            console.log("here");
            matched_items = await truth_collection.find({_id: {$in: outdated_col_doc.test_ids}}).toArray();
        }
        return matched_items; 
}