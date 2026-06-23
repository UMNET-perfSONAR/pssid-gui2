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
 * Build the ansible inventory (hosts.ini) content from the config object.
 * Pure function — returns the string so it can be written or previewed.
 * @param obj config file contents
 */
function buildIniContent(obj:&any): string {
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
  return iniContent;
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
 * Re-validates the layer 2 / layer 3 method selection on every batch
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
 * Builds the daemon config (pssid_config.json) and ansible inventory (hosts.ini)
 * from the current database state, WITHOUT writing them or running provision.
 * Shared by create_config_file (the real provision) and the dry-run preview.
 * @returns the proposed config + inventory as strings
 */
export async function build_config_payload(): Promise<{ config: string; inventory: string }> {
  get_paths();
  const client = await connectToMongoDB();
  const host_data = await get_collection(client, "hosts");
  const schedule_data = await get_collection(client, "schedules");
  const host_group_data = await get_collection(client, "host_groups");
  const job_data = await get_collection(client, "jobs");
  const batch_data = await get_collection(client, "batches");
  sanitizeBatchScripts(batch_data);
  const ssid_data = await get_collection(client, "ssid_profiles");
  const test_data = await get_collection(client, "tests");
  const formatted_test_data = await formatTestData(test_data.tests);
  const obj = Object.assign(host_data,
                            host_group_data,
                            schedule_data,
                            ssid_data, formatted_test_data,
                            job_data, batch_data);

  const inventory = buildIniContent(obj);
  const clean_object = removeIdsProperties(obj);
  const config = JSON.stringify(clean_object, null, 2) + '\n';
  return { config, inventory };
}

/**
 * Reads the currently-deployed config + inventory from disk (what was last
 * written by a provision run), or null if not yet written. Used to diff against
 * the proposed payload in the dry-run preview.
 */
export function get_current_config(): { config: string | null; inventory: string | null } {
  get_paths();
  const readIf = (p: string | null) =>
    p && fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
  return { config: readIf(config_path), inventory: readIf(ini_path) };
}

/**
 * creates config file, ansible inventory, and executes shellscript
 * @param name - name of host or host_group where button was clicked. defaults to '*'
 * @param click_context - 'host', 'host_group', or 'auto'
 * @param caller - username of the authenticated user, or 'unauthenticated'
 * @param caller_role - 'authenticated' or 'unauthenticated'
 * @param trigger - 'manual' (user clicked Configure) or 'auto' (auto-provision)
 */
export async function create_config_file(name: string, click_context: string, caller: string = 'unauthenticated', caller_role: string = 'unauthenticated', trigger: 'manual' | 'auto' = 'manual') {
  try {
    const { config: config_content, inventory } = await build_config_payload();

    writeFileSync(ini_path, inventory);
    console.log("Writing config file...");
    writeFileSync(config_path, config_content, 'utf8');

    // Pass arguments as a vector (no shell) so a host/group name can never be
    // interpreted as shell syntax (command injection).
    console.log(`Executing provision script: ${shellscript_path} ${click_context} ${name} ${caller} ${caller_role}`);
    execFile(shellscript_path as string, [click_context, name, caller, caller_role], async (err) => {
      const record = {
        timestamp: new Date(),
        caller,
        caller_role,
        target_name: name,
        click_context,
        trigger,
        success: !err,
        ...(err ? { error: err.message } : {})
      };
      try {
        const histClient = await connectToMongoDB();
        await histClient.db('gui').collection('provision_history').insertOne(record);
      } catch (dbErr) {
        console.error('Failed to save provision history:', dbErr);
      }
      if (err) {
        console.error(`Provision script failed: context=${click_context} name=${name}`, err);
      } else {
        console.log(`Provision script completed: context=${click_context} name=${name} caller=${caller} role=${caller_role}`);
      }
    });
    
    console.log('Data successfully saved to disk');
  } catch (error) {
    console.log('An error has occurred ', error);
  }
}
