// generate a config file from current state of DBs
import { MongoClient } from 'mongodb';
import { connectToMongoDB } from './database.service';
import { execFile } from 'node:child_process';

import path from 'path';
import fs from 'fs';
// The following paths are read in from paths_config.json. Initialize them to null
// to ensure they are not used before being set in function `get_paths`.
let output_directory: string | null = null;
let config_path: string | null = null;
let ini_path: string | null = null;
let shellscript_path: string | null = null;

// Schema version of the generated pssid_config.json. Bump this when the SHAPE of
// the generated config changes in a way a consumer (daemon/tooling) should notice.
// 1.1: batches no longer carry an `archivers` array (feature removed; the daemon
//      never read it).
const CONFIG_VERSION = '1.1';

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
export function removeIdsProperties(obj:any) {
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
 * Pure function, returns the string so it can be written or previewed.
 * @param obj config file contents
 */
export function buildIniContent(obj:any): string {
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
 * Re-validates the layer 2 / layer 3 method selection on every SSID profile
 * against the scripts currently present on disk, right before the config file is
 * generated.
 *
 * The selection is already constrained by the SSID profile form, but this is a
 * second, independent check at render time: it prevents a stale value (a script
 * deleted from disk after it was selected) or a value injected directly into
 * MongoDB from being emitted into pssid_config.json, which is deployed to and
 * acted on by the probes. Any value that does not correspond to a real script
 * file is reset to '' (none) and a warning is logged. If a directory cannot be
 * read, the value is kept only if it passes a conservative character check so
 * traversal/injection characters are still stripped.
 *
 * @param ssid_data - the { ssid_profiles: [...] } object returned by get_collection
 * @param pathsOverride - layer2/layer3 directories to check instead of the ones
 *   in paths_config.json (used by tests for deterministic directory state)
 */
export function sanitizeSsidMethods(
  ssid_data: any,
  pathsOverride?: { layer2_path: string; layer3_path: string }
) {
  const paths = pathsOverride ?? JSON.parse(
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

  for (const ssid of ssid_data.ssid_profiles ?? []) {
    for (const [field, names] of [
      ['layer2_script', layer2Names],
      ['layer3_script', layer3Names],
    ] as [string, Set<string> | null][]) {
      if (!isValid(ssid[field] ?? '', names)) {
        console.warn(
          `Dropping invalid ${field} "${ssid[field]}" on ssid profile "${ssid.name}"`
        );
        ssid[field] = '';
      }
    }
  }
}

/**
 * Strips legacy archiver fields from batches before the config is generated.
 *
 * The archivers feature was removed from the GUI: the daemon (verified from
 * source) never read `batch["archivers"]`, so the field carried no meaning in
 * the deployed config. Databases written by older versions may still hold
 * `archivers` / `archiver_ids` arrays on batch documents; this drops them so
 * the emitted config is identical whether the data predates the removal or not.
 * (`archiver_ids` would also be caught by removeIdsProperties; it is deleted
 * here as well so this function alone fully describes the legacy cleanup.)
 *
 * @param batch_data - the { batches: [...] } object returned by get_collection
 */
export function stripLegacyArchivers(batch_data: any) {
  for (const batch of batch_data.batches ?? []) {
    delete batch.archivers;
    delete batch.archiver_ids;
  }
}

/**
 * Read-only pre-flight check on the assembled config object, run right before it
 * is serialized. It does NOT modify the config in any way: on valid data it is a
 * no-op and the emitted bytes are identical to what they would be without it. On
 * INVALID data (data that would crash or be silently rejected by the pSSID
 * daemon) it throws a single Error listing every problem, so the preview /
 * provision fails loudly in the GUI instead of shipping a broken config to a
 * probe.
 *
 * Scope is deliberately limited to SHAPE rules we have verified the daemon cares
 * about (type/presence/cross-reference). It intentionally does NOT try to predict
 * daemon BEHAVIOR (whether an SSID connects, whether a tool runs on a probe) —
 * that is the probe's job and only `--validate` on a real probe certifies it.
 *
 * Verified daemon-critical rules (see daemon contract):
 *  - job.parallel must be the STRING "True"/"False" (daemon string-compares it)
 *  - job['continue-if'] must be a STRING (daemon calls .lower() on it)
 *  - every batch must have a non-empty ssid_profiles array
 *  - every ssid_profile must declare a layer2_script and layer3_script
 *    (required; never blank) so the config always states the connection methods
 *  - every name referenced by a batch (jobs, ssid_profiles, schedules) must
 *    resolve to an actually-defined object
 *  - every host's batches and every host_group's hosts/batches must resolve
 *
 * Plus one generated-file safety rule: host and host_group names must be safe
 * to write into hosts.ini (no newlines or square brackets), because those names
 * are emitted verbatim into the Ansible inventory.
 *
 * @param obj - the fully-assembled config object (hosts, host_groups, schedules,
 *   ssid_profiles, tests, jobs, batches) prior to serialization
 */
export function assertDaemonValid(obj: any): void {
  const errors: string[] = [];

  const names = (arr: any): Set<string> =>
    new Set((Array.isArray(arr) ? arr : []).map((x: any) => x?.name));

  // ---- host / group names must be inventory-safe ----------------------------
  // These names are written verbatim into hosts.ini (an Ansible inventory), so
  // a name carrying a newline or square brackets could inject inventory syntax
  // (a fake [section] header or a variable assignment). Write-time validation
  // in the controllers enforces this too; this is the render-time backstop for
  // values that reached the database another way.
  const iniSafe = (v: any): boolean =>
    typeof v === 'string' && v.length > 0 && !/[\r\n\[\]]/.test(v);
  for (const host of Array.isArray(obj.hosts) ? obj.hosts : []) {
    if (!iniSafe(host.name)) {
      errors.push(`host name ${JSON.stringify(host.name)} is not inventory-safe (no newlines or square brackets)`);
    }
  }
  for (const group of Array.isArray(obj.host_groups) ? obj.host_groups : []) {
    if (!iniSafe(group.name)) {
      errors.push(`host_group name ${JSON.stringify(group.name)} is not inventory-safe (no newlines or square brackets)`);
    }
  }

  const definedJobs = names(obj.jobs);
  const definedSsids = names(obj.ssid_profiles);
  const definedSchedules = names(obj.schedules);
  const definedHosts = names(obj.hosts);
  const definedBatches = names(obj.batches);

  // ---- jobs: parallel / continue-if must be strings ------------------------
  for (const job of Array.isArray(obj.jobs) ? obj.jobs : []) {
    if (job.parallel !== 'True' && job.parallel !== 'False') {
      errors.push(
        `job "${job.name}": parallel must be the string "True" or "False", got ${JSON.stringify(job.parallel)}`
      );
    }
    if (typeof job['continue-if'] !== 'string') {
      errors.push(
        `job "${job.name}": continue-if must be a string ("true"/"false"), got ${JSON.stringify(job['continue-if'])}`
      );
    }
  }

  // ---- ssid_profiles: layer 2 and layer 3 method are required --------------
  for (const ssid of Array.isArray(obj.ssid_profiles) ? obj.ssid_profiles : []) {
    if (!ssid.layer2_script) {
      errors.push(`ssid_profile "${ssid.name}": layer2_script (layer 2 method) is required`);
    }
    if (!ssid.layer3_script) {
      errors.push(`ssid_profile "${ssid.name}": layer3_script (layer 3 method) is required`);
    }
  }

  // ---- batches: non-empty ssid_profiles + all references resolve -----------
  for (const batch of Array.isArray(obj.batches) ? obj.batches : []) {
    if (!Array.isArray(batch.ssid_profiles) || batch.ssid_profiles.length === 0) {
      errors.push(`batch "${batch.name}": ssid_profiles must be a non-empty list`);
    }
    for (const s of batch.ssid_profiles ?? []) {
      if (!definedSsids.has(s)) {
        errors.push(`batch "${batch.name}": references unknown ssid_profile "${s}"`);
      }
    }
    for (const j of batch.jobs ?? []) {
      if (!definedJobs.has(j)) {
        errors.push(`batch "${batch.name}": references unknown job "${j}"`);
      }
    }
    for (const sch of batch.schedules ?? []) {
      if (!definedSchedules.has(sch)) {
        errors.push(`batch "${batch.name}": references unknown schedule "${sch}"`);
      }
    }
  }

  // ---- hosts / host_groups: references resolve -----------------------------
  for (const host of Array.isArray(obj.hosts) ? obj.hosts : []) {
    for (const b of host.batches ?? []) {
      if (!definedBatches.has(b)) {
        errors.push(`host "${host.name}": references unknown batch "${b}"`);
      }
    }
  }
  for (const group of Array.isArray(obj.host_groups) ? obj.host_groups : []) {
    for (const b of group.batches ?? []) {
      if (!definedBatches.has(b)) {
        errors.push(`host_group "${group.name}": references unknown batch "${b}"`);
      }
    }
    for (const h of group.hosts ?? []) {
      if (!definedHosts.has(h)) {
        errors.push(`host_group "${group.name}": references unknown host "${h}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      'Config validation failed; not generating pssid_config.json:\n  - ' +
        errors.join('\n  - ')
    );
  }
}

/**
 * Builds the top-level `pssid_metadata` block: provenance about THIS config file
 * (as opposed to the array collections, which describe what the probes do). It is
 * a single object of individual scalar fields (not an array) so consumers can read
 * e.g. config_version directly.
 *
 * @param meta - who/what triggered the generation. caller/caller_role come from
 *   the authenticated request when available, else default to 'unauthenticated'.
 */
function buildMetadata(meta: { caller?: string; caller_role?: string }) {
  return {
    pssid_metadata: {
      config_version: CONFIG_VERSION,
      generator: 'pssid-gui',
      generated_at: new Date().toISOString(),
      generated_by: meta.caller || 'unauthenticated',
      generated_by_role: meta.caller_role || 'unauthenticated',
    },
  };
}

/**
 * Returns a config JSON string with the volatile `pssid_metadata` block removed,
 * for equality comparisons. `generated_at` (and possibly generated_by) changes on
 * every build, so a raw string compare of two configs would ALWAYS differ; the
 * dry-run preview uses this so a pure provenance change is not reported as a real
 * config change. Falls back to the raw string if it cannot be parsed.
 */
export function stripConfigMetadata(configStr: string | null): string {
  if (!configStr) return '';
  try {
    const parsed = JSON.parse(configStr);
    delete parsed.pssid_metadata;
    return JSON.stringify(parsed);
  } catch {
    return configStr;
  }
}

/**
 * Metadata (v1): host- and group-level key/value data, stored in the `data`
 * field on hosts and host_groups. For each host, the effective metadata layers
 * the metadata of every group the host belongs to underneath the host's own, so
 * host keys win on collision. Collisions between two groups are order-dependent
 * and therefore indeterminate by contract. The result is attached as `metadata`
 * on each host in the generated config so the daemon can resolve references (for
 * example a test destination or an interface name) per host.
 */
export function applyMetadata(host_data: any, host_group_data: any) {
  const asObject = (d: any): Record<string, any> =>
    (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
  const groupMetaByHost: Record<string, Record<string, any>> = {};
  for (const group of host_group_data.host_groups ?? []) {
    const gmeta = asObject(group.data);
    for (const hostName of group.hosts ?? []) {
      groupMetaByHost[hostName] = { ...(groupMetaByHost[hostName] || {}), ...gmeta };
    }
  }
  for (const host of host_data.hosts ?? []) {
    host.metadata = { ...(groupMetaByHost[host.name] || {}), ...asObject(host.data) };
  }
}

/**
 * Builds the daemon config (pssid_config.json) and ansible inventory (hosts.ini)
 * from the current database state, WITHOUT writing them or running provision.
 * Shared by create_config_file (the real provision) and the dry-run preview.
 * @param meta - caller/caller_role recorded in the config's pssid_metadata block.
 * @returns the proposed config + inventory as strings
 */
export async function build_config_payload(
  meta: { caller?: string; caller_role?: string } = {}
): Promise<{ config: string; inventory: string }> {
  get_paths();
  const client = await connectToMongoDB();
  const host_data = await get_collection(client, "hosts");
  const schedule_data = await get_collection(client, "schedules");
  const host_group_data = await get_collection(client, "host_groups");
  const job_data = await get_collection(client, "jobs");
  const batch_data = await get_collection(client, "batches");
  stripLegacyArchivers(batch_data);
  const ssid_data = await get_collection(client, "ssid_profiles");
  sanitizeSsidMethods(ssid_data);
  applyMetadata(host_data, host_group_data);
  const test_data = await get_collection(client, "tests");
  const formatted_test_data = await formatTestData(test_data.tests);
  // pssid_metadata first so it heads the generated file as a provenance header,
  // sitting at the same level as the array collections below it.
  const obj = Object.assign({},
                            buildMetadata(meta),
                            host_data,
                            host_group_data,
                            schedule_data,
                            ssid_data, formatted_test_data,
                            job_data, batch_data);

  // Read-only pre-flight: throws on data that would crash/reject at the daemon.
  // No-op (and config bytes unchanged) when the data is valid.
  assertDaemonValid(obj);

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
 */
export async function create_config_file(name: string, click_context: string, caller: string = 'unauthenticated', caller_role: string = 'unauthenticated') {
  const { config: config_content, inventory } = await build_config_payload({ caller, caller_role });

  fs.writeFileSync(ini_path as string, inventory);
  console.log("Writing config file...");
  fs.writeFileSync(config_path as string, config_content, 'utf8');

  // Pass arguments as a vector (no shell) so a host/group name can never be
  // interpreted as shell syntax (command injection).
  console.log(`Executing provision script: ${shellscript_path} ${click_context} ${name} ${caller} ${caller_role}`);
  execFile(shellscript_path as string, [click_context, name, caller, caller_role], (err) => {
    if (err) {
      console.error(`Provision script failed: context=${click_context} name=${name}`, err);
    } else {
      console.log(`Provision script completed: context=${click_context} name=${name} caller=${caller} role=${caller_role}`);
    }
  });

  console.log('Data successfully saved to disk');
}
