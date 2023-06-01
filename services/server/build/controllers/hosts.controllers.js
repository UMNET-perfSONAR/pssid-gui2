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
    const collection = yield (yield client).db('gui').collection('hosts');
    const response = yield collection.find().project({ _id: 0, "host": 0 }).toArray();
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
    const data = req.body;
    const batchData = data.batchData;
    let object = `${data.name}`;
    var collection = yield (yield client).db('gui').collection('hosts');
    collection.insertOne({
        "host": data.name,
        [object]: { "batches": batchData },
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
    let old_host = `${old_hostname}`;
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('hosts');
    // Update data - Do in two steps - error otherwise. TODO - Look into shortening this
    collection.updateOne({
        "host": old_hostname
    }, { $set: { "host": new_hostname, [old_host + ".batches"]: batchData },
    });
    collection.updateOne({
        "host": new_hostname
    }, { $rename: { [old_host]: new_hostname }
    });
    res.json(data);
}));
module.exports = { getHosts,
    getOneHost,
    deleteHost,
    postHost,
    updateHost };
