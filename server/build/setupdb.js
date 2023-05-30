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
// Run this script while connected to MongoDB
const ideas_service_1 = require("./services/ideas.service");
function startup() {
    return __awaiter(this, void 0, void 0, function* () {
        // connect to db
        var client = (0, ideas_service_1.connectToMongoDB)();
        (yield client).connect();
        console.log("Connected to MongoDB. Beginning setup now...");
        var db = (yield client).db('gui');
        // create relevant collections 
        var collectionList = ["schedules", "ssid_profiles", "tests", "jobs", "archivers", "batches", "hosts", "host_groups"];
        collectionList.forEach(function (collectionName) { db.createCollection(collectionName); });
    });
}
startup();
