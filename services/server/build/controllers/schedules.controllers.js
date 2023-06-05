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
var client = (0, ideas_service_1.connectToMongoDB)();
// get all schedules 
const getSchedules = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    var collection = (yield client).db("gui").collection("schedules");
    const schedules = yield collection.find().project({ _id: 0 }).toArray();
    res.send(schedules);
}));
// delete a schedule
const deleteSchedule = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const name = String(req.params.schedulename);
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('schedules');
    yield collection.findOneAndDelete({ "schedule": name });
    res.send('schedule ' + name + ' was deleted');
}));
// add a single schedule to db 
const postSchedule = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('schedules');
    collection.insertOne({
        "schedule": req.body.schedule,
        "repeat": req.body.repeat
    });
    res.json(req.body);
}));
// TODO: Add option to provide meta-information 
// completely update one schedule
const updateSchedule = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (yield client).connect();
    var collection = yield (yield client).db('gui').collection('schedules');
    collection.updateOne({
        "schedule": req.body.old_schedule
    }, { $set: { "schedule": req.body.new_schedule, "repeat": req.body.repeat }
    });
    res.json(req.body);
}));
module.exports = { getSchedules,
    deleteSchedule,
    postSchedule,
    updateSchedule };
