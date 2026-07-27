// Every API endpoint must be gated.
//
// This is a structural test, not a behavioural one: it reads the route files and
// asserts that each registered verb carries an authorize() guard. It exists
// because the failure it catches is invisible in review -- a new endpoint added
// without a guard looks exactly like the ones around it, works perfectly in
// testing, and is world-writable in production.
//
// If this fails on a route you have just added, add `authorize('read')` or
// `authorize('write')` to it. If an endpoint genuinely must be public, register
// it in index.ts ahead of the authentication middleware (as /api/health is) and
// state why there; do not add an exception here.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTES_DIR = path.resolve(__dirname, '..');

/** Route files that legitimately register no guarded resource. */
const EXEMPT = new Set([
  // The identity endpoint. It is what tells the browser whether anyone is signed
  // in, so it has to answer for an unauthenticated caller too; index.ts gates
  // /api/* with requireApiAuthentication when SSO is on, and with SSO off there
  // is no identity to protect. It exposes the caller's own claims and nothing else.
  'userinfo.routes.ts',
]);

const routeFiles = fs
  .readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith('.routes.ts') || f.endsWith('.routers.ts'));

/** `router.get('/path', ...)` for every HTTP verb express exposes. */
const VERB_CALL = /\.\s*(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]*)\2\s*,([^;]*)\)/gms;

describe('every API route is guarded by authorize()', () => {
  it('finds the route files', () => {
    // A rename or a move that empties this list would make every assertion below
    // pass by vacuity, which is the one way a test like this fails silently.
    expect(routeFiles.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of routeFiles) {
    const source = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf-8');

    it(`${file}: no unguarded endpoint`, () => {
      const unguarded: string[] = [];
      for (const match of source.matchAll(VERB_CALL)) {
        const [, verb, , routePath, handlers] = match;
        if (!/\bauthorize\s*\(\s*['"](read|write)['"]\s*\)/.test(handlers)) {
          unguarded.push(`${verb.toUpperCase()} ${routePath}`);
        }
      }
      if (EXEMPT.has(file)) {
        // Exempt files are allowed to be unguarded, but must not quietly become
        // the place new resource endpoints are added.
        expect(unguarded.length).toBeLessThanOrEqual(1);
        return;
      }
      expect(unguarded, `unguarded endpoints in ${file}`).toEqual([]);
    });

    it(`${file}: write verbs require write access`, () => {
      const wrong: string[] = [];
      for (const match of source.matchAll(VERB_CALL)) {
        const [, verb, , routePath, handlers] = match;
        const mutating = ['post', 'put', 'patch', 'delete'].includes(verb);
        if (mutating && /\bauthorize\s*\(\s*['"]read['"]\s*\)/.test(handlers)) {
          wrong.push(`${verb.toUpperCase()} ${routePath}`);
        }
      }
      expect(wrong, `state-changing endpoints gated on read-only in ${file}`).toEqual([]);
    });
  }
});
