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
const update_service_1 = require("../services/update.service");
const delete_service_1 = require("../services/delete.service");
var client = (0, ideas_service_1.connectToMongoDB)();
/**
 * Return all schedule information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getSchedules = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db("gui").collection("schedules");
        const schedules = yield collection.find().project({ _id: 0 }).toArray();
        res.send(schedules);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Delete specified schedule from database. schedule to be deleted comes as URL parameter
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const deleteSchedule = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.schedulename);
        (yield client).connect();
        const schedule_col = (yield client).db('gui').collection('schedules');
        const batch_col = (yield client).db('gui').collection('batches');
        const deleted = yield schedule_col.findOne({ "name": name });
        (0, delete_service_1.deleteDocument)(batch_col, 'schedules', 'schedule_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name); // delete references from other collections
        yield schedule_col.findOneAndDelete({ "name": name });
        res.send('schedule ' + name + ' was deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new schedule entry in database.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postSchedule = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('schedules');
        collection.insertOne({
            "name": req.body.name,
            "repeat": req.body.repeat
        });
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates schedule with information specified by the user.
 * Triggers update in batches to ensure up to date information.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateSchedule = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('schedules');
        yield collection.updateOne({
            "name": req.body.old_schedule
        }, { $set: { "name": req.body.new_schedule, "repeat": req.body.repeat }
        });
        if (req.body.old_schedule !== req.body.new_schedule) { // Trigger update in batches collection
            yield (0, update_service_1.updateCollection)('batches', 'schedules', client); // update batches using schedules collection
        }
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
module.exports = { getSchedules,
    deleteSchedule,
    postSchedule,
    updateSchedule };
