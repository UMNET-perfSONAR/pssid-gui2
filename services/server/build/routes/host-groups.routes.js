"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
var hostGroups = express_1.default.Router();
const { getHostGroups, getOneHostGroup, deleteHostGroup, postHostGroup, updateHostGroup } = require('../controllers/HostGroups.controllers');
hostGroups.get('/', getHostGroups);
hostGroups.get('/:HostGroup-group-name', getOneHostGroup);
hostGroups.delete('/:HostGroup-group-name', deleteHostGroup);
hostGroups.post('/create-HostGroup-group', postHostGroup);
// HostGroups.put('/HostGroup/:old_HostGroup/:new_HostGroupname/:new_batches', updateHostGroup);
hostGroups.put('/update-HostGroup-group', updateHostGroup);
module.exports = hostGroups;
