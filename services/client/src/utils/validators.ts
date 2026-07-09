// Shared input validators for the pSSID GUI forms.
//
// Every form field imports the relevant validator from here, so a rule is
// enforced identically everywhere. Host names, group names and SSID profile
// names share one rule (validName); schedule names are human-readable labels
// and use validDisplayName. Each validator takes the raw value and returns
// { valid, error }; error is '' when valid.
//
// A few rules involve deliberate choices where the upstream spec is loose:
//   - backoff is an ISO 8601 DURATION (e.g. PT30S), the pScheduler format, not a
//     timestamp.
//   - continue-if is a jq expression; we do a lightweight structural check here
//     rather than embed a full jq parser.
//   - cron is validated as a standard 5-field expression.
//   - a network interface name is treated as strictly alphanumeric per the spec
//     (so VLAN dot-notation like eth0.100 is intentionally rejected).

export interface ValidationResult {
  valid: boolean;
  error: string;
}

const ok: ValidationResult = { valid: true, error: '' };
const fail = (error: string): ValidationResult => ({ valid: false, error });

/**
 * RFC 1123 host name: one or more dot-separated labels, each 1-63 chars of
 * [A-Za-z0-9-] with no leading or trailing hyphen, total length <= 253. Shared by
 * host names, group names and SSID profile names.
 */
export function validName(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  if (v.length > 253) return fail('Must be 253 characters or fewer.');
  const label = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  for (const l of v.split('.')) {
    if (!label.test(l)) {
      return fail('Use letters, digits and hyphens; each label 1-63 chars, no leading or trailing hyphen.');
    }
  }
  return ok;
}

/**
 * Human-readable object label, for names that never enter hosts.ini (for
 * example schedule names, which are display labels like "Every day at 23:00").
 * Letters and digits plus space, dot, underscore, colon and hyphen; must start
 * with a letter or digit; at most 128 characters. Mirrors the server-side rule
 * (controllers/helpers.ts), so what the form accepts is what the API accepts.
 */
export function validDisplayName(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,127}$/.test(v)) {
    return fail('Use letters, digits, spaces and . _ : - ; start with a letter or digit; max 128 characters.');
  }
  return ok;
}

/** IPv4 dotted quad with each octet 0-255. */
function isIpv4(v: string): boolean {
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((o) => {
    const n = Number(o);
    return n >= 0 && n <= 255 && String(n) === o;
  });
}

/** Standard IPv6 matcher (including :: compression and IPv4-mapped forms). */
function isIpv6(v: string): boolean {
  return /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6})|:((:[0-9A-Fa-f]{1,4}){1,7}|:))$/.test(v);
}

/** A single host-list entry: a valid host name OR an IP address. */
export function validHostOrIp(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  if (isIpv4(v) || isIpv6(v)) return ok;
  // Only digits and dots is an IPv4 attempt, not a host name. RFC 1123 does
  // permit all-numeric labels, but "999.1.1.1" or "1.2.3" typed here is a
  // mistyped address, and accepting it would put a bad entry in hosts.ini.
  if (/^[\d.]+$/.test(v)) return fail('Not a valid IPv4 address.');
  // Colons only occur in (failed) IPv6 attempts; give the accurate message.
  if (v.includes(':')) return fail('Not a valid IPv6 address.');
  return validName(v);
}

/**
 * IEEE 802.11 SSID (the broadcast network name): 1-32 bytes (UTF-8). We also
 * reject leading/trailing spaces and control characters, which routinely cause
 * trouble in practice.
 */
export function validSsidNetworkName(value: string): ValidationResult {
  const v = value ?? '';
  if (v.length === 0) return fail('Required.');
  const bytes = new TextEncoder().encode(v).length;
  if (bytes > 32) return fail('SSID must be 1-32 bytes.');
  if (v !== v.trim()) return fail('No leading or trailing spaces.');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(v)) return fail('No control characters.');
  return ok;
}

/**
 * A single shell token, used for layer 2 / layer 3 method names. No spaces, no
 * shell metacharacters, no path separators, no '..' traversal. These are static,
 * directory-derived names; this mirrors the server-side script validation as a
 * safety net.
 */
export function validSingleToken(value: string): ValidationResult {
  const v = value ?? '';
  if (!v) return fail('Required.');
  if (!/^[A-Za-z0-9._-]+$/.test(v)) return fail('Only letters, digits, dot, underscore and hyphen; no spaces.');
  if (v.includes('..')) return fail("Must not contain '..'.");
  return ok;
}

/** Network interface name: strictly alphanumeric. */
export function validInterfaceName(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  if (!/^[A-Za-z0-9]+$/.test(v)) return fail('Use letters and numbers only, e.g. wlan0.');
  return ok;
}

/** Priority: a whole number (non-negative integer). */
export function validWholeNumber(value: string | number): ValidationResult {
  const v = String(value ?? '').trim();
  if (!v) return fail('Required.');
  if (!/^\d+$/.test(v)) return fail('Must be a whole number (0 or greater).');
  return ok;
}

/**
 * pScheduler backoff: an ISO 8601 DURATION, e.g. PT30S, PT5M, PT1H30M. This is a
 * duration, not a timestamp.
 */
export function validIso8601Duration(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  const re = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;
  if (!re.test(v)) return fail('Must be an ISO 8601 duration, e.g. PT30S or PT1H.');
  return ok;
}

/**
 * continue-if is a jq expression evaluated by the daemon. A full jq grammar is
 * out of scope, so we require a non-empty expression with balanced brackets and
 * parentheses as a lightweight sanity check.
 */
export function validJqClause(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  for (const ch of v) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch in closers && stack.pop() !== closers[ch]) {
      return fail('Unbalanced brackets in the jq expression.');
    }
  }
  if (stack.length) return fail('Unbalanced brackets in the jq expression.');
  return ok;
}

/**
 * Standard 5-field cron expression (minute hour day-of-month month day-of-week).
 * Each field may be *, a number, a range, a comma list, or a step, within the
 * field's allowed range.
 */
export function validCron(value: string): ValidationResult {
  const v = (value ?? '').trim();
  if (!v) return fail('Required.');
  const fields = v.split(/\s+/);
  if (fields.length !== 5) return fail('Cron must have 5 fields: minute hour day month weekday.');
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
  for (let i = 0; i < 5; i++) {
    if (!fieldOk(fields[i], ranges[i][0], ranges[i][1])) {
      return fail(`Invalid cron field ${i + 1} ("${fields[i]}").`);
    }
  }
  return ok;
}

/**
 * Turns a 5-field cron expression into a plain-English description, e.g.
 * "every 5 minutes", "every 6 hours", "every day at 23:00", "every Monday at
 * 09:30". This describes what the expression ACTUALLY does, so it stays correct
 * even when a schedule's name is stale (named "every 4 hours" but set to run
 * every 6). It covers the common shapes; anything more elaborate (comma lists,
 * ranges, multi-field steps) falls back to the raw expression, which is always
 * accurate. Assumes a valid expression; callers guard with validCron.
 */
export function describeCron(value: string): string {
  const v = (value ?? '').trim();
  if (!validCron(v).valid) return v || '(no schedule)';
  const [min, hour, dom, month, dow] = v.split(/\s+/);

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];

  const isAny = (f: string) => f === '*';
  const isNum = (f: string) => /^\d+$/.test(f);
  const isStep = (f: string) => /^\*\/\d+$/.test(f);
  const stepOf = (f: string) => Number(f.split('/')[1]);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = () => `${pad(Number(hour))}:${pad(Number(min))}`;
  const pastMinute = () => (Number(min) === 0 ? '' : ` at ${pad(Number(min))} minutes past`);

  const daily = isAny(dom) && isAny(month) && isAny(dow);

  // every minute
  if (isAny(min) && isAny(hour) && daily) return 'every minute';

  // every N minutes
  if (isStep(min) && isAny(hour) && daily) {
    const n = stepOf(min);
    return n === 1 ? 'every minute' : `every ${n} minutes`;
  }

  // once an hour, at a fixed minute
  if (isNum(min) && isAny(hour) && daily) {
    return Number(min) === 0 ? 'every hour, on the hour' : `every hour at ${pad(Number(min))} minutes past`;
  }

  // every N hours
  if (isNum(min) && isStep(hour) && daily) {
    const n = stepOf(hour);
    return n === 1 ? `every hour${pastMinute()}` : `every ${n} hours${pastMinute()}`;
  }

  // a fixed time of day, on some recurrence
  if (isNum(min) && isNum(hour)) {
    if (daily) return `every day at ${time()}`;
    if (isAny(dom) && isAny(month) && isNum(dow)) return `every ${DAYS[Number(dow) % 7]} at ${time()}`;
    if (isNum(dom) && isAny(month) && isAny(dow)) return `on day ${Number(dom)} of every month at ${time()}`;
    if (isNum(dom) && isNum(month) && isAny(dow)) return `on ${MONTHS[Number(month)]} ${Number(dom)} at ${time()}`;
  }

  // Anything more elaborate: the raw expression is always accurate.
  return v;
}
