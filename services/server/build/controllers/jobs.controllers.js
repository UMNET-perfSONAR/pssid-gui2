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
var client = (0, database_service_1.connectToMongoDB)();
/**
 * Return all job information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getJobs = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('jobs');
        const response = yield collection.find().project({ _id: 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Get one job by 'name'
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getOneJob = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.hostname);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('jobs');
        var response = collection.find({ "name": name }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Delete specified ssid_profile from database. ssid_profile to be deleted comes as URL parameter
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const deleteJob = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.job);
        (yield client).connect();
        const job_col = (yield client).db('gui').collection('jobs');
        const batch_col = (yield client).db('gui').collection('batches');
        const deleted = yield job_col.findOne({ "name": name });
        (0, delete_service_1.deleteDocument)(batch_col, 'jobs', 'job_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name); // delete references from other collections
        yield job_col.findOneAndDelete({ "name": name });
        res.send('host ' + name + ' was deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new job entry in database.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postJob = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('jobs');
        let test_ids = yield (0, utility_services_1.get_test_ids)(client, req.body);
        yield collection.insertOne({
            "name": req.body.name,
            "parallel": req.body.parallel,
            "tests": req.body.tests,
            "test_ids": test_ids,
            "continue-if": req.body['continue-if']
        });
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates jobs with information specified by the user.
 * Triggers update in batches to ensure up to date information.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateJob = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let body = req.body;
        (yield client).connect();
        var collection = (yield client).db('gui').collection('jobs');
        let doc = yield collection.findOne({ name: req.body.old_job });
        yield collection.updateOne({
            "name": body.old_job
        }, { $set: { "name": body.new_job, "parallel": body.parallel, "continue-if": body['continue-if'],
                "test_ids": (JSON.stringify(doc === null || doc === void 0 ? void 0 : doc.tests) === JSON.stringify(body.tests))
                    ? doc === null || doc === void 0 ? void 0 : doc.tests : yield (0, utility_services_1.get_test_ids)(client, body),
                "tests": body.tests }
        });
        if (body.old_job !== body.new_job) { // Trigger update in batches collection
            (0, update_service_1.updateCollection)('batches', 'jobs', client); // update batches using jobs collection
        }
        res.json(body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
module.exports = { getJobs,
    getOneJob,
    deleteJob,
    postJob,
    updateJob };
