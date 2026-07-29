// Host-group pattern matching, and the safety rule that decides which patterns
// are allowed to be evaluated at all.
//
// Its own module, with no imports, because both sides of the application need
// it and neither may depend on the other: config.service.ts evaluates patterns
// during config generation, and controllers/helpers.ts rejects dangerous ones at
// write time. Services never import controllers, so the shared rule lives here.

/**
 * Whether a group body contains a quantifier -- `*`, `+` or `{n,m}` -- outside a
 * character class. Inside `[...]` those characters are literals.
 */
function hasQuantifier(body: string): boolean {
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') { i++; continue; }          // escaped: never a quantifier
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '*' || c === '+' || c === '{') return true;
  }
  return false;
}

/**
 * Whether a host pattern has the shape that backtracks catastrophically.
 *
 * These are compiled with `new RegExp` and run against every host name during
 * config generation and every probe-view render. Node's regex engine backtracks
 * and cannot be given a time limit, and it runs on the single thread that serves
 * every request -- so one pattern of this shape does not slow a request down, it
 * hangs the whole server for everybody. Measured on `(a+)+$`: a 27-character
 * name takes 0.6s, 31 takes 24s, and each further character doubles it. The
 * 256-character ceiling on a pattern does nothing to bound that.
 *
 * The rule: a group that is itself quantified AND contains a quantifier. That is
 * the `(a+)+`, `(a*)*`, `(x+x+)+` family, which is what nearly every real case
 * reduces to. Ordinary patterns are unaffected -- `.*` (the shipped `all` group),
 * `probe-.*`, `(foo|bar).*` and `(a|b)+` all pass, since none nests a quantifier
 * inside a quantified group.
 *
 * This is a heuristic, not a proof: it does not catch every pathological regex
 * (`(a|a)+` overlaps without nesting). Catching all of them needs a linear-time
 * engine such as RE2 rather than a syntactic check.
 */
export function isRiskyHostPattern(pattern: unknown): boolean {
  if (typeof pattern !== 'string') return false;
  const open: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') { open.push(i); continue; }
    if (c === ')') {
      const start = open.pop();
      if (start === undefined) continue;        // unbalanced; RegExp rejects it later
      const next = pattern[i + 1];
      const quantified = next === '*' || next === '+' || next === '{';
      if (quantified && hasQuantifier(pattern.slice(start + 1, i))) return true;
    }
  }
  return false;
}

/**
 * Does a host name belong to a group by pattern? Mirrors the daemon, which uses
 * Python's `re.match` (see `find_matching_regex` in pssid-daemon.py). That means
 * a hosts_regex entry is a FULL regular expression, anchored at the START of the
 * hostname but NOT the end (re.match matches a prefix), and an invalid pattern is
 * skipped rather than fatal.
 *
 * We mirror that here so the GUI's Preview and per-host view show the same group
 * membership the daemon will compute:
 *  - prepend '^' (re.match anchors the start) and do NOT append '$' (re.match
 *    does not anchor the end, so a bare prefix like "probe" matches
 *    "probe-01"); end a pattern with '$' for an exact match.
 *  - compile the pattern as-is: '.', '*', '+', '?', '[...]', '(...)', '|', '\d'
 *    etc. are all honored, exactly like Python re (they are not treated as
 *    literal characters).
 *  - an invalid pattern (e.g. a bare '*') throws in RegExp and is treated as no
 *    match, the same way the daemon's caught re.error skips it.
 * JavaScript and Python regex agree for the character classes and quantifiers
 * hostnames use.
 *
 * A pattern of the catastrophic shape is skipped rather than evaluated, and
 * treated as no match. The API refuses to STORE one, so this only fires for a
 * group written before that check existed -- but it is the line that actually
 * protects the server, because it sits at the point where the hang would happen
 * rather than at the point where the pattern arrives.
 */
export function matchesHostPattern(pattern: string, hostname: string): boolean {
  if (typeof pattern !== 'string' || pattern.length === 0) return false;
  if (isRiskyHostPattern(pattern)) {
    console.warn(
      'Skipping a host pattern that could not be evaluated safely (nested repeat): %s',
      JSON.stringify(pattern)
    );
    return false;
  }
  try {
    return new RegExp('^' + pattern).test(hostname);
  } catch {
    return false;
  }
}
