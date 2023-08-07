"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToMongoDB = void 0;
const mongodb_1 = require("mongodb");
function connectToMongoDB() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = "mongodb://mongo:27017"; // instead of localhost:27017, use mongo:27017 as is defined in Docker
        const client = new mongodb_1.MongoClient(uri);
        yield client.connect();
        yield client.db("admin").command({ ping: 1 });
        console.info(`Connected to MongoDB`);
        return client;
    });
}
exports.connectToMongoDB = connectToMongoDB;
function applySchemaValidation(database, collection, schema) {
    return __awaiter(this, void 0, void 0, function* () {
        yield database.command({
            collMod: collection,
            validator: schema
        })
            .catch((error) => __awaiter(this, void 0, void 0, function* () {
            const { codeName } = error;
            if (codeName === 'NamespaceNotFound') {
                yield database.createCollection(collection, {
                    validator: schema
                });
            }
        }));
    });
}
