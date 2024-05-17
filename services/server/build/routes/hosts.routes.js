"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
var hosts = express_1.default.Router();
const { getHosts, getOneHost, deleteHost, postHost, deleteAll, updateHost, createConfig } = require('../controllers/hosts.controllers');
hosts.get('/', getHosts);
hosts.get('/:hostname', getOneHost);
hosts.delete('/:hostname', deleteHost);
hosts.post('/config', createConfig);
hosts.post('/create-host', postHost);
hosts.delete('/', deleteAll);
hosts.put('/update-host', updateHost);
module.exports = hosts;
