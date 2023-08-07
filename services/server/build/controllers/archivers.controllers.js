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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_service_1 = require("../services/database.service");
const update_service_1 = require("../services/update.service");
const delete_service_1 = require("../services/delete.service");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
var client = (0, database_service_1.connectToMongoDB)();
/**
 * Return all archiver information from mongodb
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getArchivers = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('archivers');
        const response = yield collection.find().project({ _id: 0 }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Get one archiver by 'name'
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const getOneArchiver = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.Archivername);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('archivers');
        var response = collection.find({ "name": name }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Delete specified archiver from database. archiver to be deleted comes as URL parameter
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const deleteArchiver = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.archiver_name);
        (yield client).connect();
        var archiver_col = (yield client).db('gui').collection('archivers');
        var batch_col = (yield client).db('gui').collection('batches');
        const deleted = yield archiver_col.findOne({ "name": name });
        (0, delete_service_1.deleteDocument)(batch_col, 'archivers', 'archiver_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name); // delete references from other collections
        yield archiver_col.findOneAndDelete({ "name": name });
        res.send('archiver ' + name + ' was deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Creates new archiver entry in database.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const postArchiver = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('archivers');
        collection.insertOne({
            "name": req.body.name,
            "archiver": req.body.archiver,
            "data": req.body.data
        });
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Updates archiver with information specified by the user.
 * Triggers update in batches to ensure up to date information.
 *
 * @param req - request information from client
 * @param res - response sent back to client
 */
const updateArchiver = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let body = req.body;
        (yield client).connect();
        var collection = (yield client).db('gui').collection('archivers');
        // Update data - Do in two steps - error otherwise. TODO - Look into shortening this
        collection.updateOne({
            "name": body.old_arc_name
        }, { $set: { "name": body.new_arc_name, "archiver": body.archiver,
                "data": body.data },
        });
        if (body.old_arc_name !== body.new_arc_name) { // Trigger update in batches collection
            (0, update_service_1.updateCollection)('batches', 'archivers', client); // update batches using ssid_profiles collection
        }
        res.json(body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Read archiver option filenames from archiver_options
 *
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readFileNames = ((req, res) => {
    try {
        console.log(__dirname);
        const directoryPath = path_1.default.join(__dirname, '../archiver_options');
        fs_1.default.readdir(directoryPath, function (err, files) {
            if (err) {
                return console.log('Unable to scan directory:' + err);
            }
            let fileArray = [];
            files.forEach(function (file) {
                fileArray.push(file.slice(0, -5));
                console.log(file.slice(0, -5));
            });
            res.send(fileArray);
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});
/**
 * Read selected filename (params.name) from archiver_options - send contents back as a json array
 *
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readArchiverFile = ((req, res) => {
    try {
        console.log('reading selected file');
        var name = '../archiver_options/' + req.params.name + '.json';
        const filePath = path_1.default.join(__dirname, name);
        var object = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
        res.json(object);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});
module.exports = { getArchivers,
    getOneArchiver,
    deleteArchiver,
    postArchiver,
    updateArchiver,
    readFileNames,
    readArchiverFile };
