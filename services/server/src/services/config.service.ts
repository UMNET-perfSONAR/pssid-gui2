// generate a config file from current state of DBs
import { MongoClient } from 'mongodb';
import { connectToMongoDB } from './database.service';
import { exec } from 'node:child_process';

import path from 'path';
import fs from 'fs';
const { writeFileSync } = require('fs');
let config_path = './config.json';
let ini_path = './ansible.ini';
let shellscript_path = './provision.sh';

/**
 * Get specified collection data - flexible for all collections
 * @param client - MongoClient instance
 * @param col - collection name for extraction
 * @returns - all data from a given collection
 */
async function get_collection(client: MongoClient, col: String) {
    client.connect();
    const db = client.db('gui');
    const data = await db.collection(`${col}`).find().project({_id:0}).toArray();
    var collection_data = {[`${col}`]:data};
    return collection_data;  
}

/**
 * Removes **_ids fields from all objects in config.json file 
 * @param obj - full config file with additional *_ids fields
 * @returns - modified object with **_ids removed 
 */
function removeIdsProperties(obj:any) {
    for (const key in obj) {
        if (key.endsWith('_ids')) {
            delete obj[key];
        }
        else if (typeof(obj[key])== 'object') {
            removeIdsProperties(obj[key]);
        }
    }
    return obj;
}

/**
 * write ansible inventory file for ansible 
 * @param obj config file contents 
 */
function writeIniFile(obj:&any) {
    let iniContent = ''
    // print all hosts first
    for (const host of obj.hosts.map((item:{name:string})=> item.name)) {
        iniContent += host + '\n';
    }
    iniContent += '\n';

    for (const group of obj.host_groups) {
        iniContent += `[${group.name}]` + '\n'
        if (group.hosts_regex.length !== 0) {
            iniContent += '#Regex ' + `[${group.name}] [` + group.hosts_regex + ']\n';
        }
        for (const host of group.hosts) {
            iniContent += host + '\n';
        }
        iniContent += '\n';
    }
    writeFileSync(ini_path, iniContent);
}

/**
 * Gets shellscript, config file, and ansible inventory output paths
 */
function get_paths() { 
    var name = '../../config_output.json';
    const filePath = path.join(__dirname, name);
    var object = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    config_path = object.config_path;
    ini_path = object.inventory_path;
    shellscript_path = object.shellscript_path;
}
 
/**
 * creates config file, ansible inventory, and executes shellscript 
 * @param name - name of host or host_group where "submit to probes" was clicked. defaults to '*'
 * @param click_context - context of which "submit to probes" was clicked - either hosts or host_groups
 */
export async function create_config_file(name: string, click_context:string) {
    try {
        get_paths();
        const client = await connectToMongoDB();
        let host_data = await get_collection(client, "hosts");
        let schedule_data = await get_collection(client, "schedules");
        let host_group_data = await get_collection(client, "host_groups");
        let archiver_data = await get_collection(client, "archivers");
        let job_data = await get_collection(client, "jobs");
        let batch_data = await get_collection(client, "batches");
        let ssid_data = await get_collection(client, "ssid_profiles");
        let test_data = await get_collection(client, "tests");
        let obj = Object.assign(host_data,  
                                host_group_data, 
                                archiver_data, schedule_data,
                                ssid_data, test_data,
                                job_data, batch_data);

        writeIniFile(obj);    
        const clean_object = removeIdsProperties(obj);
        writeFileSync(config_path, JSON.stringify(clean_object, null, 2), 'utf8');
       
        exec(`'${shellscript_path}' '--${click_context}' '${name}'`, (err) => {console.error(err)})
        
        console.log('Data successfully saved to disk');
    } catch (error) {
        console.log('An error has occurred ', error);
    }
    }
