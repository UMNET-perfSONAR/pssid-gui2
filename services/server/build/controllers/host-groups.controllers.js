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
// import { client } from '../index';
// TODO: Scope of client variable - Import from another module?
var client = (0, ideas_service_1.connectToMongoDB)();
// get all HostGroups
const getHostGroups = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    const collection = yield (yield client).db('gui').collection('host_groups');
    const response = yield collection.find().project({ _id: 0, "host_group": 0 }).toArray();
    res.send(response);
}));
// get a single host
const getOneHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const host_group = String(req.params.host_group);
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('host_groups');
    var response = collection.find({ "host_group": host_group }).project({ _id: 0, "host_group": 0 }).toArray();
    res.send(response);
}));
// delete a single host
const deleteHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const host_group = String(req.params.host_group);
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('host_groups');
    yield collection.findOneAndDelete({ "host_group": host_group });
    res.send('Host ' + host_group + ' was deleted');
}));
// add a single host to db 
const postHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('host_groups');
    var data = req.body;
    const host_group_name = `${data.host_group}`;
    collection.insertOne({
        "host_group": data.host_group,
        [host_group_name]: {
            "hosts": data.hosts,
            "batches": data.batchData
        }
    });
    res.json(req.body);
}));
// TODO: Add option to provide meta-information 
// completely update one host
const updateHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    const data = req.body;
    const old_group_ref = `${data.old_host_group}`;
    var collection = yield (yield client).db('gui').collection('host_groups');
    collection.updateOne({
        "host": data.old_host_group
    }, { $set: { "host": data.new_host_group, [old_group_ref + "hosts"]: data.hosts,
            [old_group_ref + "batches"]: data.batchData }
    });
    collection.updateOne({
        "host": data.new_host_group
    }, { $rename: { [old_group_ref]: data.new_host_group } });
    res.json(data);
}));
module.exports = { getHostGroups,
    getOneHost,
    deleteHost,
    postHost,
    updateHost };
