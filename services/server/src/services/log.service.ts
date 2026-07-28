// One rule for putting a caller-supplied value into a log line.
//
// The audit trail (audit.service.ts) does not need this: it emits one
// JSON.stringify'd object per entry, and JSON escaping already turns a newline
// in a host name into a literal \n that cannot start a new record. The plain
// console.log lines elsewhere have no such protection, and several of them
// interpolate values that arrive from outside: a host or group name off the
// request URL, a `caller` from an identity provider's claim, a request path.
//
// A CR or LF in any of those lets the writer forge whole log entries -- an
// operator reading `docker compose logs`, or a log shipper parsing them, then
// sees events that never happened, which is how a log stops being evidence
// (CodeQL js/log-injection). Escape sequences are the same problem aimed at
// whatever terminal is tailing the output.

/** Longest a single interpolated value may be before it is truncated. */
const MAX_LOGGED_LENGTH = 200;

/** C0 controls (CR and LF among them) and DEL. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/**
 * Render a value safe to interpolate into a log line: control characters
 * replaced, and the result bounded so one oversized field cannot push the rest
 * of a line out of a reader's view.
 */
export function forLog(value: unknown): string {
  const cleaned = String(value).replace(CONTROL_CHARS, '?');
  return cleaned.length > MAX_LOGGED_LENGTH
    ? cleaned.slice(0, MAX_LOGGED_LENGTH) + '...'
    : cleaned;
}
