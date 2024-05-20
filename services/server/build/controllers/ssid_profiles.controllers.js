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
const delete_service_1 = require("../services/delete.service");
// TODO: Scope of client variable - Import from another module?
var client = (0, database_service_1.connectToMongoDB)();
/**
 * Return all ssid_profile information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getSSIDProfiles = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('ssid_profiles');
        const response = yield collection.find().project({ _id: 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Get one ssid_profile by 'name'
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getOneSSIDProfile = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.SSIDProfilename);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('ssid_profiles');
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
const deleteSSIDProfile = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.ssidProfile_name);
        (yield client).connect();
        var ssid_profile_col = (yield client).db('gui').collection('ssid_profiles');
        var batch_col = (yield client).db('gui').collection('batches');
        const deleted = yield ssid_profile_col.findOne({ "name": name });
        (0, delete_service_1.deleteDocument)(batch_col, 'ssid_profiles', 'ssid_profile_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name); // delete references from other collections
        yield ssid_profile_col.findOneAndDelete({ "name": name }); // remove from collection 
        res.send('ssid_profile ' + name + ' was deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new ssid_profile entry in database.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postSSIDProfile = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        console.log('ssid');
        var collection = (yield client).db('gui').collection('ssid_profiles');
        yield collection.insertOne({
            "name": req.body.name,
            "SSID": req.body.ssid,
            "test_level": req.body.test_level,
            "min_signal": req.body.min_signal
        });
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates ssid_profile with information specified by the user.
 * Triggers update in batches to ensure up to date information.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateSSIDProfile = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let body = req.body;
        (yield client).connect();
        console.log(body.old_ssid_name);
        var collection = (yield client).db('gui').collection('ssid_profiles');
        yield collection.updateOne({
            "name": body.old_ssid_name
        }, { $set: { "name": body.new_ssid_name, "SSID": body.ssid,
                "test_level": body.test_level, "min_signal": body.min_signal },
        });
        if (body.old_ssid_name !== body.new_ssid_name) { // Trigger update in batches collection
            (0, update_service_1.updateCollection)('batches', 'ssid_profiles', client); // update batches using ssid_profiles collection
        }
        res.json(body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
module.exports = { getSSIDProfiles,
    getOneSSIDProfile,
    deleteSSIDProfile,
    postSSIDProfile,
    updateSSIDProfile };
