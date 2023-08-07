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
// TODO: Scope of client variable - Import from another module?
var client = (0, database_service_1.connectToMongoDB)();
// get all tests
const getTests = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        const collection = (yield client).db('gui').collection('tests');
        const response = yield collection.find().toArray();
        console.log('tests');
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
// get a single test
const getOneTest = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.testname);
        (yield client).connect();
        var collection = (yield client).db('gui').collection('tests');
        var response = collection.find({ "name": name }).toArray();
        res.send(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
// delete a single test
const deleteTest = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = String(req.params.testname);
        (yield client).connect();
        var test_col = (yield client).db('gui').collection('tests');
        var job_col = (yield client).db('gui').collection('jobs');
        const deleted = yield test_col.findOne({ "name": name });
        (0, delete_service_1.deleteDocument)(job_col, 'tests', 'test_ids', deleted === null || deleted === void 0 ? void 0 : deleted.name); // delete references from other collections
        yield test_col.findOneAndDelete({ "name": name });
        res.send('test ' + name + ' was deleted');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
// add a single test to db 
const postTest = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (yield client).connect();
        var collection = (yield client).db('gui').collection('tests');
        console.log('test insetion');
        yield collection.insertOne({
            "name": req.body.name,
            "type": req.body.type,
            "spec": req.body.spec
        });
        res.json(req.body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
// TODO: Add option to provide meta-information 
// completely update one test
const updateTest = ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let body = req.body;
        (yield client).connect();
        var collection = (yield client).db('gui').collection('tests');
        yield collection.updateOne({
            "name": body.old_testname
        }, { $set: { "name": body.new_testname, "type": body.type,
                "spec": body.spec },
        });
        if (body.old_testname !== body.new_testname) { // Trigger update in jobs collection
            yield (0, update_service_1.updateCollection)('jobs', 'tests', client); // update jobs using tests collection
        }
        res.json(body);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
}));
/**
 * Read test option filenames from test_options
 *
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readFileNames = ((req, res) => {
    try {
        console.log(__dirname);
        const directoryPath = path_1.default.join(__dirname, '../test_options');
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
 * Read selected filename (params.name) from test_options - send contents back as a json array
 *
 * @param req - request information sent from client
 * @param res - response sent back to client
 */
const readTestFile = ((req, res) => {
    try {
        console.log('reading selected file');
        var name = '../test_options/' + req.params.name + '.json';
        const filePath = path_1.default.join(__dirname, name);
        var object = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
        res.json(object);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});
module.exports = { getTests,
    getOneTest,
    deleteTest,
    postTest,
    updateTest,
    readFileNames,
    readTestFile };
