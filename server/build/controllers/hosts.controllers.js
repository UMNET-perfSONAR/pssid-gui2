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
const ideas_service_1 = require("../services/ideas.service");
// TODO: Scope of client variable - Import from another module?
var client = (0, ideas_service_1.connectToMongoDB)();
// get all hosts
const getHosts = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    var response = yield (yield client).db('gui').collection('hosts').find().toArray();
    console.log(response);
    res.send(response);
}));
// get a single host
const getOneHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const name = String(req.params.hostname);
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('hosts');
    var response = collection.find({ "host": name }).toArray();
    res.send(response);
}));
// delete a single host
const deleteHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const name = String(req.params.hostname);
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('hosts');
    yield collection.findOneAndDelete({ "host": name });
    res.send('Host ' + name + ' was deleted');
}));
// add a single host to db 
const postHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('hosts');
    var data = req.body;
    collection.insertOne({
        "host": data.name,
        "batches": data.batchData
    });
    res.json(req.body);
}));
// TODO: Add option to provide meta-information 
// completely update one host
const updateHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = req.body;
    const old_hostname = data.old_hostname;
    const new_hostname = data.new_hostname;
    const batchData = data.batchData;
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('hosts');
    collection.updateOne({
        "host": old_hostname
    }, { $set: { "host": new_hostname, "batches": batchData }
    });
    res.json(data);
}));
module.exports = { getHosts,
    getOneHost,
    deleteHost,
    postHost,
    updateHost };
