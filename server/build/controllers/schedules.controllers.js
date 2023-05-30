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
const mongodb_1 = require("mongodb");
const getSchedules = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const uri = "mongodb://mongo:27017/gui"; // instead of localhost:27017, use mongo:27017 as is defined in Docker
    const client = new mongodb_1.MongoClient(uri);
    yield client.connect();
    var collection = yield client.db("gui").collection("schedules");
    const specific = yield collection.find().toArray();
    console.info(specific);
    res.send(yield collection.find().toArray());
}));
module.exports = getSchedules;
