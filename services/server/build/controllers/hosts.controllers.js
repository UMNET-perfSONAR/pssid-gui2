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
const update_service_1 = require("../services/update.service");
const utility_services_1 = require("../services/utility.services");
const delete_service_1 = require("../services/delete.service");
const config_service_1 = require("../services/config.service");
// TODO: Scope of client variable - Import from another module?
var client = (0, database_service_1.connectToMongoDB)();
/**
 * Return all host information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getHosts = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('hosts');
        const response = yield collection.find().toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Get one host by 'name'
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getOneHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.hostname);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('hosts');
        var response = collection.find({ "name": name }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Delete specified host from database. host to be deleted comes as URL parameter
 *
 * TODO - Compress to one lookup (findOneAndDelete)
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const deleteHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.hostname);
        (yield client).connect();
        var hosts_col = (yield client).db('gui').collection('hosts');
        const deleted = yield hosts_col.findOne({ "name": name });
        var host_groups_col = (yield client).db('gui').collection('host_groups');
        (0, delete_service_1.deleteDocument)(host_groups_col, 'hosts', 'host_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name); // delete references from other collections
        yield hosts_col.findOneAndDelete({ "name": name }); // remove from collection 
        res.send('host ' + name + ' was deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
const deleteAll = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var hosts_col = (yield client).db('gui').collection('hosts');
        // TODO: UPDATE HOST_GROUPS
        hosts_col.deleteMany({});
        res.send('all hosts were deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new host entry in database.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('hosts');
        let batch_ids = yield (0, utility_services_1.get_batch_ids)(client, req.body);
        yield collection.insertOne({
            "name": req.body.name,
            "batches": req.body.batches,
            "batch_ids": batch_ids,
            "data": req.body.data
        });
        console.log(req.body);
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates host with information specified by the user.
 * Triggers update in host_groups to ensure up to date information.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateHost = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let body = req.body;
        console.log('updateHost controller');
        (yield client).connect();
        var collection = (yield client).db('gui').collection('hosts');
        let doc = yield collection.findOne({ name: req.body.old_hostname });
        yield collection.updateOne({
            "name": body.old_hostname
        }, { $set: { "name": body.new_hostname, "batches": body.batches,
                "batch_ids": (JSON.stringify(req.body.batches) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.batches)) ? // update reference _ids if changes made 
                    doc === null || doc === void 0 ? void 0 : doc.batches : yield (0, utility_services_1.get_batch_ids)(client, req.body),
                "data": body.data },
        });
        if (body.new_hostname !== body.old_hostname) { // Trigger update in hosts
            (0, update_service_1.updateCollection)('host_groups', 'hosts', client); // update host_groups using hosts collection
        }
        res.json(body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
const createConfig = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let name = (req.body.length == 0) ? '*' : req.body.name;
        console.log('config creation');
        console.log(name);
        yield (0, config_service_1.create_config_file)(name, 'host');
        res.send('Config file created');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
module.exports = { getHosts,
    getOneHost,
    deleteHost,
    postHost,
    deleteAll,
    updateHost,
    createConfig };
