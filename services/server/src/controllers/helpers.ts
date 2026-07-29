import { Response } from 'express';
import { Collection } from 'mongodb';

/**
 * The response to a successful delete, for every collection that has one.
 *
 * JSON rather than `res.send('<thing> ' + name + ' was deleted')`, which is
 * what these all used to be. Express labels a STRING body `text/html`, so a
 * name echoed back that way is markup as far as the browser is concerned --
 * and the name comes straight off the request URL. Talk a signed-in browser
 * into DELETEing `<img src=x onerror=...>` and that script runs on this
 * origin, with this deployment's session (CodeQL js/reflected-xss). A JSON
 * body is never sniffed as HTML, so the echo is inert.
 *
 * Nothing reads the text: every client store checks `response.ok` and shows a
 * message of its own (see e.g. services/client/src/stores/host_store.ts).
 */
export const sendDeleted = (res: Response, subject: string, name: string): void => {
  res.json({ message: `${subject} ${name} was deleted` });
};

export const isNameInDB = async (collection: Collection, name: string): Promise<boolean> => {
  // Coerce to a string so a request body like {"name": {"$ne": null}} can't turn
  // this lookup into a NoSQL operator query (injection / duplicate-check bypass).
  const dbItem = await collection.findOne({ "name": String(name) });
  return dbItem !== null;
}

/**
 * Server-side rule for every object name (hosts, groups, schedules, SSID
 * profiles, tests, jobs, batches). Names are written into pssid_config.json
 * and, for hosts and host groups, verbatim into the Ansible inventory
 * (hosts.ini), so an unconstrained name could inject inventory syntax (a
 * newline followed by a [section] header or a variable assignment). The GUI
 * forms enforce stricter per-field rules; this is the API-level floor that
 * holds even for direct API calls.
 *
 * Allowed: letters and digits, plus space, dot, underscore, colon and hyphen
 * in the middle; must start with a letter or digit; at most 128 characters.
 * (Spaces and colons are allowed because human-readable schedule names such as
 * "Every day at 23:00" are part of the shipped defaults.)
 */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,127}$/;
export const isValidObjectName = (name: unknown): boolean =>
  typeof name === 'string' && NAME_PATTERN.test(name);

/**
 * RFC 1123 host name: dot-separated labels of letters, digits and hyphens,
 * each 1-63 characters with no leading or trailing hyphen, 253 characters
 * total. Host group and SSID profile names use the same rule, mirroring the
 * client-side validName.
 */
export const isValidRfc1123Name = (name: unknown): boolean => {
  if (typeof name !== 'string' || name.length === 0 || name.length > 253) return false;
  const label = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  return name.split('.').every((l) => label.test(l));
};

const isIpv4 = (v: string): boolean =>
  v.split('.').length === 4 &&
  v.split('.').every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255 && String(Number(o)) === o);

const isIpv6 = (v: string): boolean =>
  /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6})|:((:[0-9A-Fa-f]{1,4}){1,7}|:))$/.test(v);

/**
 * A host entry: an RFC 1123 host name or an IPv4/IPv6 address. Host entries
 * are written into hosts.ini and connected to by the provisioning playbook,
 * so anything else is a bad inventory line. Mirrors the client validHostOrIp.
 */
export const isValidHostEntry = (name: unknown): boolean => {
  if (typeof name !== 'string') return false;
  if (isIpv4(name) || isIpv6(name)) return true;
  // All digits-and-dots is a mistyped IPv4 address, not a host name.
  if (/^[\d.]+$/.test(name) || name.includes(':')) return false;
  return isValidRfc1123Name(name);
};

/**
 * Network interface name, e.g. wlan0: letters and digits only. A metadata
 * reference like $ifacename is also accepted: the daemon substitutes it per
 * host from that host's effective metadata, so one batch can address a
 * different interface on each probe.
 */
export const isValidInterfaceName = (v: unknown): boolean =>
  typeof v === 'string' && /^([A-Za-z0-9]{1,64}|\$[A-Za-z0-9_]{1,64})$/.test(v);

/** Priority: a whole number (0 or greater), sent as a number or numeric string. */
export const isWholeNumber = (v: unknown): boolean =>
  (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000_000) ||
  (typeof v === 'string' && /^\d{1,9}$/.test(v.trim()));

/** pScheduler backoff: an ISO 8601 duration such as PT30S or PT1H30M. */
export const isValidIso8601Duration = (v: unknown): boolean =>
  typeof v === 'string' &&
  /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/.test(v.trim());

/**
 * continue-if: a jq expression the daemon evaluates. A full jq parser is out
 * of scope; require a non-empty single-line string with balanced brackets,
 * same as the client-side check.
 */
export const isValidJqExpression = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0 || s.length > 512 || /[\r\n]/.test(s)) return false;
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch in closers && stack.pop() !== closers[ch]) return false;
  }
  return stack.length === 0;
};

/**
 * IEEE 802.11 SSID (the broadcast network name): 1-32 bytes of UTF-8, no
 * control characters, no leading or trailing whitespace.
 */
export const isValidSsidName = (v: unknown): boolean => {
  if (typeof v !== 'string' || v.length === 0 || v !== v.trim()) return false;
  if (Buffer.byteLength(v, 'utf8') > 32) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001F\u007F]/.test(v);
};

/** An array of reference names, each passing the object-name floor. */
export const isNameArray = (v: unknown): boolean =>
  Array.isArray(v) && v.every((x) => isValidObjectName(x));

/**
 * The target of a provision request: '*' for the whole config, or one object
 * name. Returns null when the payload names nothing valid.
 *
 * This value becomes an ENTRY IN THE ARGUMENT VECTOR of the operator's
 * provision script (execFile in config.service.ts), so it is not ordinary
 * request data. Two things made the unvalidated version a real problem:
 *
 *  * A value beginning with `-` is read as an OPTION by whatever that script
 *    forwards it to -- ansible-playbook, rsync, getopts. execFile spawns no
 *    shell, so metacharacters were already inert, but argument injection needs
 *    no shell. The name floor requires a leading letter or digit, which closes
 *    it.
 *  * A non-string (`{"name": {...}}`) reached execFile, which throws on a
 *    non-string argv entry -- turning a bad request into a 500.
 *
 * The empty array is the GUI's own way of saying "the whole config"
 * (settings.store.ts generateConfig), and is the only shape it ever sends.
 */
export const provisionTarget = (body: unknown): string | null => {
  if (Array.isArray(body)) return body.length === 0 ? '*' : null;
  if (body === null || typeof body !== 'object') return null;
  const name = (body as Record<string, unknown>).name;
  if (name === '*') return '*';
  return isValidObjectName(name) ? (name as string) : null;
};

/** Free-form metadata: absent, or a plain (non-array) object. */
export const isPlainObjectOrAbsent = (v: unknown): boolean =>
  v === undefined || v === null ||
  (typeof v === 'object' && !Array.isArray(v));

/**
 * A metadata key, which is exactly what a `$reference` can name.
 *
 * The daemon resolves `$key` per host from that host's effective metadata, and
 * substitution stops at the first character outside this set -- so a key with a
 * hyphen in it can be stored but never referenced: `$external-dest` resolves as
 * `$external` followed by a literal `-dest`, silently producing the wrong test
 * target rather than an error. Matching the reference syntax here is what makes
 * "it saved" and "it works on the probe" the same condition.
 *
 * Deliberately identical to the client's validInterfaceName reference rule
 * (services/client/src/utils/validators.ts) so the form and the API agree.
 */
const METADATA_KEY = /^[A-Za-z0-9_]{1,64}$/;

/** Upper bounds. Generous for this domain, and they stop one request writing an
 *  unbounded blob into every probe's slice of the generated config. */
const METADATA_MAX_KEYS = 100;
const METADATA_MAX_VALUE = 1024;

/**
 * Free-form metadata, checked as the daemon actually consumes it: a FLAT object
 * of string key/value pairs. Returns an error message, or null when valid.
 *
 * `isPlainObjectOrAbsent` above accepted any non-array object, so a nested
 * object or an array value passed the API, was stored, and was written into
 * pssid_config.json -- where the daemon expects a scalar to substitute. Nothing
 * rejected it at any point: the probe received a config it could not use, and
 * the GUI reported success. The interface can only ever produce flat strings
 * (both metadata inputs are text fields), so this rejects nothing a form can
 * make -- only payloads sent directly to the API.
 */
export const metadataError = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    return "Metadata must be an object of key/value pairs";
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > METADATA_MAX_KEYS) {
    return `Metadata is limited to ${METADATA_MAX_KEYS} keys`;
  }
  for (const [key, value] of entries) {
    if (!METADATA_KEY.test(key)) {
      return `Metadata key "${key}" must be letters, numbers or underscores ` +
        `(up to 64), so it can be referenced as $${key}`;
    }
    if (typeof value !== 'string') {
      return `Metadata value for "${key}" must be text`;
    }
    if (value.length > METADATA_MAX_VALUE) {
      return `Metadata value for "${key}" must be ${METADATA_MAX_VALUE} characters or fewer`;
    }
  }
  return null;
};

/**
 * Standard 5-field cron expression (minute hour day-of-month month weekday).
 * Mirrors the client-side validCron rule so the API enforces what the form
 * promises: each field is *, a number, a range, a comma list, or a step,
 * within that field's allowed range.
 */
export const isValidCron = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const ranges: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  const fieldOk = (field: string, min: number, max: number): boolean =>
    field.split(',').every((part) => {
      const [range, stepStr] = part.split('/');
      if (stepStr !== undefined && !/^\d+$/.test(stepStr)) return false;
      if (range === '*') return true;
      const within = (n: number) => n >= min && n <= max;
      if (/^\d+$/.test(range)) return within(Number(range));
      const rm = range.match(/^(\d+)-(\d+)$/);
      if (rm) return within(Number(rm[1])) && within(Number(rm[2])) && Number(rm[1]) <= Number(rm[2]);
      return false;
    });
  return fields.every((f, i) => fieldOk(f, ranges[i][0], ranges[i][1]));
};
