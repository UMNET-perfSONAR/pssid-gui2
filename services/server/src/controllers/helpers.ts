import { Collection } from 'mongodb';

export const isNameInDB = async (collection: Collection, name: string): Promise<boolean> => {
  const dbItem = await collection.findOne({ "name": name });
  return dbItem !== null;
}
