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
const database_service_1 = require("../services/database.service");
const utility_services_1 = require("../services/utility.services");
const config_service_1 = require("../services/config.service");
var client = (0, database_service_1.connectToMongoDB)();
/**
 * Return all host_group information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getHostGroups = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('host_groups');
        const response = yield collection.find().project({ _id: 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Get one host_group by 'name'
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getOneHostGroup = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const host_group = String(req.params.host_group);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('host_groups');
        var response = collection.find({ "name": host_group }).project({ _id: 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Delete specified host_group from database. host_group to be deleted comes as URL parameter
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const deleteHostGroup = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const host_group = String(req.params.host_group);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('host_groups');
        yield collection.findOneAndDelete({ "name": host_group });
        res.send('Host ' + host_group + ' was deleted!');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new host_group entry in database.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postHostGroup = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('host_groups');
        var data = req.body;
        collection.insertOne({
            "name": data.name,
            "batches": data.batches,
            "batch_ids": yield (0, utility_services_1.get_batch_ids)(client, data),
            "hosts": data.hosts,
            "host_ids": yield (0, utility_services_1.get_host_ids)(client, data),
            "hosts_regex": data.hosts_regex,
            "data": data.data
        });
        res.json(data);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates host_group with information specified by the user.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateHostGroup = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        let data = req.body;
        let collection = (yield client).db('gui').collection('host_groups');
        let doc = yield collection.findOne({ name: req.body.old_hostgroup });
        console.log(data.hosts_regex);
        yield collection.updateOne({
            "name": data.old_hostgroup
        }, { $set: { "name": data.new_hostgroup, "hosts": data.hosts,
                "hosts_regex": data.hosts_regex,
                "batches": data.batches, "data": data.data,
                "batch_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.batches)) ? // update reference _ids if changes made 
                    doc === null || doc === void 0 ? void 0 : doc.batch_ids : yield (0, utility_services_1.get_batch_ids)(client, req.body),
                "host_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.hosts)) ? // update reference _ids if changes made 
                    doc === null || doc === void 0 ? void 0 : doc.host_ids : yield (0, utility_services_1.get_host_ids)(client, req.body),
            }
        });
        res.json(data);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
const createConfig = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let name = (req.body.length == 0) ? '*' : req.body.name;
        yield (0, config_service_1.create_config_file)(name, 'host_group');
        res.send('Config file created');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
module.exports = { getHostGroups,
    getOneHostGroup,
    deleteHostGroup,
    postHostGroup,
    updateHostGroup,
    createConfig };
