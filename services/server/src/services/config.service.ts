// generate a config file from current state of DBs
import { MongoClient } from 'mongodb';
import { connectToMongoDB } from './database.service';
import { exec } from 'node:child_process';

import path from 'path';
import fs from 'fs';
const { writeFileSync } = require('fs');
// The following paths are read in from paths_config.json. Initialize them to null
// to ensure they are not used before being set in function `get_paths`.
let output_directory: string | null = null;
let config_path: string | null = null;
let ini_path: string | null = null;
let shellscript_path: string | null = null;

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
  var name = '../../paths_config.json';
  const filePath = path.join(__dirname, name);
  var object = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  output_directory = object.output_directory;
  config_path = object.config_path;
  ini_path = object.inventory_path;
  shellscript_path = object.shellscript_path;
  if (config_path === null || ini_path === null ||
    shellscript_path === null || output_directory === null) {
    throw new Error('Paths not set in paths_config.json');
  }
  // Ensure the parent output directory exists.
  if (!fs.existsSync(output_directory)) {
    fs.mkdirSync(output_directory, { recursive: true });
  }
}

/*
 * Formats a test spec.
 *
 * See comments below for formatTestData for the format of a test spec
 * and the role of this function.
 */
export function formatTestSpec(spec: Array<any>) {
  const result_spec: any = {};
  spec.forEach((element) => {
    if (element.type === "text" || element.type === "number" ||
      element.type === "float") {
      result_spec[element.name] = element.value;
    }
    else if (element.type === "singleselect") {
      result_spec[element.name] = element.selected.name;
    }

    // multiselect is not allowed in test specs.
    else if (element.type === "multiselect") {
      throw new Error(
	"Multiselect is not allowed in test specs: ${JSON.stringify(element)}"
      );
    }

    // The only other type of data is user-defined optional data, which should
    // be a key-value pair without other fields.
    else if (!element.hasOwnProperty('type')) {
      if (!element.hasOwnProperty('key') || !element.hasOwnProperty('value')) {
	throw new Error(`Invalid test specs found: ${JSON.stringify(element)}`);
      }
      result_spec[element.key] = element.value;
    }
  });

  return result_spec;
}

/*
 * Formats test data to be written to the output config file.
 *
 * It's necessary for test specs only because of the dynamic form used in the frontend.
 * Extra information is stored in the DB in order to render frontend pages correctly,
 * but the backend perfSONAR has strict field requirements and does not accept extra
 * fields. The functionality of this function is to extract essential fields right
 * before generating the config file, while leaving extra fields intact in the DB.
 *
 * A valid test has the following format
 * {
 *   "name": "<test_name>",
 *   "type": "<test_type>",
 *   "spec": {
 *     "<key>": "<value>",
 *     ...
 *   }
 * }
 *
 * This function extracts the name and type of a test and calls formatTestSpec to
 * extract the spec field.
 */
export async function formatTestData(test_data: Array<any>) {
  const formatted_data_array: any = [];
  test_data.forEach((test) => {
    const formatted_test: any = {};
    formatted_test['name'] = test.name;
    formatted_test['type'] = test.type;
    formatted_test['spec'] = formatTestSpec(test.spec);
    formatted_data_array.push(formatted_test);
  });
  const formatted_data = {"tests": formatted_data_array};
  return formatted_data;
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
    let job_data = await get_collection(client, "jobs");
    let batch_data = await get_collection(client, "batches");
    let ssid_data = await get_collection(client, "ssid_profiles");
    let test_data = await get_collection(client, "tests");
    let formatted_test_data = await formatTestData(test_data.tests);
    let obj = Object.assign(host_data,  
                            host_group_data, 
                            schedule_data,
                            ssid_data, formatted_test_data,
                            job_data, batch_data);

    writeIniFile(obj);    
    const clean_object = removeIdsProperties(obj);
    const config_content = JSON.stringify(clean_object, null, 2) + '\n';
    console.log("Writing config file...");
    writeFileSync(config_path, config_content, 'utf8');
    
    exec(`'${shellscript_path}' '${click_context}' '${name}'`, (err) => {console.error(err)})
    
    console.log('Data successfully saved to disk');
  } catch (error) {
    console.log('An error has occurred ', error);
  }
}
