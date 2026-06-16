// generate a config file from current state of DBs
import { MongoClient } from 'mongodb';
import { connectToMongoDB } from './database.service';
import { execFile } from 'node:child_process';

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
 * Returns the set of valid script names (without extension) in a directory, or
 * null if the directory cannot be read.
 */
function listScriptNames(dirPath: string): Set<string> | null {
  try {
    return new Set(fs.readdirSync(dirPath).map((f) => path.parse(f).name));
  } catch {
    return null;
  }
}

/**
 * Re-validates the layer 2 / layer 3 / general script selection on every batch
 * against the scripts currently present on disk, right before the config file is
 * generated.
 *
 * The selection is already validated when a batch is written (see
 * batches.controllers.ts), but this is a second, independent check at render
 * time: it prevents a stale value (a script deleted from disk after it was
 * selected) or a value injected directly into MongoDB from being emitted into
 * pssid_config.json, which is deployed to and acted on by the probes. Any value
 * that does not correspond to a real script file is reset to '' (none) and a
 * warning is logged. If a directory cannot be read, the value is kept only if it
 * passes a conservative character check so traversal/injection characters are
 * still stripped.
 *
 * @param batch_data - the { batches: [...] } object returned by get_collection
 */
function sanitizeBatchScripts(batch_data: any) {
  const paths = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../paths_config.json'), 'utf-8')
  );
  const layer2Names = listScriptNames(paths.layer2_path);
  const layer3Names = listScriptNames(paths.layer3_path);
  const scriptNames = listScriptNames(paths.scripts_path);
  const safePattern = /^[A-Za-z0-9._-]+$/;

  const isValid = (value: string, names: Set<string> | null): boolean => {
    if (!value) return true;
    if (names === null) return safePattern.test(value);
    return names.has(value);
  };

  for (const batch of batch_data.batches ?? []) {
    for (const [field, names] of [
      ['layer2_script', layer2Names],
      ['layer3_script', layer3Names],
      ['script', scriptNames],
    ] as [string, Set<string> | null][]) {
      if (!isValid(batch[field] ?? '', names)) {
        console.warn(
          `Dropping invalid ${field} "${batch[field]}" on batch "${batch.name}"`
        );
        batch[field] = '';
      }
    }
  }
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
    sanitizeBatchScripts(batch_data);
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
    
    // Pass arguments as a vector (no shell) so a host/group name can never be
    // interpreted as shell syntax (command injection).
    console.log(`Executing provision script: ${shellscript_path} ${click_context} ${name}`);
    execFile(shellscript_path as string, [click_context, name], (err) => {
      if (err) { console.error(err); }
      else { console.log(`Provision script completed: context=${click_context} name=${name}`); }
    });
    
    console.log('Data successfully saved to disk');
  } catch (error) {
    console.log('An error has occurred ', error);
  }
}
