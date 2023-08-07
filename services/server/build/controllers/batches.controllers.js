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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_service_1 = require("../services/database.service");
const utility_services_1 = require("../services/utility.services");
const update_service_1 = require("../services/update.service");
const delete_service_1 = require("../services/delete.service");
// TODO: Scope of client variable - Import from another module?
var client = (0, database_service_1.connectToMongoDB)();
/**
 * Return all batch information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getBatches = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('batches');
        const response = yield collection.find().project({ _id: 0,
            "ssid_profile_ids": 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Get one batch from batches collection by 'name'
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getOneBatch = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const batch = String(req.params.batch);
        (yield client).connect();
        var collection = yield (yield client).db('gui').collection('batches');
        var response = collection.find({ "name": batch }).project({ _id: 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Delete specified batch from database. batch to be deleted comes as URL parameter
 *
 * @param req - request information from client. specific batch in
 * @param res - response sent back to client
 */
const deleteBatch = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    try {
        const batch = String(req.params.batchname);
        (yield client).connect();
        let batch_col = (yield client).db('gui').collection('batches');
        let deleted = yield batch_col.findOne({ "name": batch });
        try {
            for (var _d = true, _e = __asyncValues(['hosts', 'host_groups']), _f; _f = yield _e.next(), _a = _f.done, !_a;) {
                _c = _f.value;
                _d = false;
                try {
                    const item = _c;
                    console.log(item);
                    const outdated_collection = (yield client).db('gui').collection(item);
                    yield (0, delete_service_1.deleteDocument)(outdated_collection, 'batches', 'batch_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name);
                }
                finally {
                    _d = true;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
        yield batch_col.findOneAndDelete({ "name": batch }); // remove from collection 
        res.send('batch ' + batch + ' was deleted!');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new batch entry in database. Inserts ObjectId arrays for ssid_profiles, jobs, schedules, archivers
 * to make compatible with future updates.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postBatch = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('batches');
        var data = req.body;
        const ssid_profile_ids = yield (0, utility_services_1.get_ssid_profile_ids)(client, data);
        const schedule_ids = yield (0, utility_services_1.get_schedule_ids)(client, data);
        const job_ids = yield (0, utility_services_1.get_job_ids)(client, data);
        console.log(job_ids);
        const archiver_ids = yield (0, utility_services_1.get_archiver_ids)(client, data);
        collection.insertOne({
            "name": data.name,
            "priority": data.priority,
            "bssid_scan_interface": data.bssid_scan,
            "ssid_profiles": data.ssid_profiles,
            "ssid_profile_ids": ssid_profile_ids,
            "schedules": data.schedules,
            "schedule_ids": schedule_ids,
            "jobs": data.jobs,
            "job_ids": job_ids,
            "archivers": data.archivers,
            "archiver_ids": archiver_ids
        });
        res.json(data);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates batch with information specified by the user.
 * Triggers updates in hosts and host_groups to ensure up to date information.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateBatch = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        let collection = (yield client).db('gui').collection('batches');
        let data = req.body;
        let doc = yield collection.findOne({ name: data.old_batchname });
        yield collection.updateOne({
            "name": data.old_batchname
        }, { $set: { "name": data.new_batchname, "priority": data.priority,
                "bssid_scan_interface": data.bssid_scan, "ttl": data.ttl,
                "ssid_profiles": data.ssid_profiles, "schedules": data.schedules,
                "jobs": data.jobs, "archivers": data.archivers,
                "ssid_profile_ids": (JSON.stringify(data.ssid_profiles) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.ssid_profiles)) ? // update reference _ids if changes made 
                    doc === null || doc === void 0 ? void 0 : doc.ssid_profile_ids : yield (0, utility_services_1.get_ssid_profile_ids)(client, data),
                "schedule_ids": (JSON.stringify(data.schedules) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.schedules)) ?
                    doc === null || doc === void 0 ? void 0 : doc.schedules : yield (0, utility_services_1.get_schedule_ids)(client, data),
                "archiver_ids": (JSON.stringify(data.archivers) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.archivers)) ?
                    doc === null || doc === void 0 ? void 0 : doc.archiver_ids : yield (0, utility_services_1.get_archiver_ids)(client, data),
                "job_ids": (JSON.stringify(data.jobs) === JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.jobs)) ?
                    doc === null || doc === void 0 ? void 0 : doc.job_ids : yield (0, utility_services_1.get_job_ids)(client, data),
            }
        });
        if (data.old_batchname !== data.new_batchname) { // trigger host and host_groups updates
            (0, update_service_1.updateCollection)('hosts', 'batches', client); // update hosts using batches collection
            (0, update_service_1.updateCollection)('host_groups', 'batches', client); // update host_groups using batches collection
        }
        res.json(data);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
module.exports = { getBatches,
    getOneBatch,
    deleteBatch,
    postBatch,
    updateBatch };
