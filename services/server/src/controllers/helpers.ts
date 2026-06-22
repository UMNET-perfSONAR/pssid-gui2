import { Collection } from 'mongodb';

export const isNameInDB = async (collection: Collection, name: string): Promise<boolean> => {
  // Coerce to a string so a request body like {"name": {"$ne": null}} can't turn
  // this lookup into a NoSQL operator query (injection / duplicate-check bypass).
  const dbItem = await collection.findOne({ "name": String(name) });
  return dbItem !== null;
}
