import { Collection } from 'mongodb';

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

/** Network interface name, e.g. wlan0: letters and digits only. */
export const isValidInterfaceName = (v: unknown): boolean =>
  typeof v === 'string' && /^[A-Za-z0-9]{1,64}$/.test(v);

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

/** Free-form metadata: absent, or a plain (non-array) object. */
export const isPlainObjectOrAbsent = (v: unknown): boolean =>
  v === undefined || v === null ||
  (typeof v === 'object' && !Array.isArray(v));

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
