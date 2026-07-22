// Audit trail: who changed what, when, and whether it was allowed.
//
// Every state-changing API request emits one structured line, plus every denied
// request of any method (a rejected read is as interesting as an accepted
// write). Lines go to stdout, which the Docker json-file driver already captures
// and rotates (see the *default-logging anchor in docker-compose.yml), so they
// survive to `docker compose logs` with no new storage to manage and can be
// shipped to a log aggregator later without touching this code.
//
// Deliberately NOT recorded: request and response bodies. An SSID profile can
// carry a pre-shared key and a settings payload can carry other operator
// secrets, and an audit log is exactly the wrong place to copy them into. The
// resource is identified by method + path, which is enough to answer "who
// changed this host" without duplicating its contents.
//
// This middleware must never affect the request it observes: everything runs
// after the response has been sent, and the whole body is wrapped so a logging
// fault can never turn a working request into a 500.

import { Request, Response, NextFunction } from 'express';

/** Methods that change server state and therefore always warrant an entry. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Marker prefix so entries can be extracted from mixed output with a grep. */
export const AUDIT_PREFIX = 'AUDIT';

export interface AuditEntry {
  ts: string;
  actor: string;
  role: 'authenticated' | 'unauthenticated';
  method: string;
  path: string;
  status: number;
  outcome: 'allowed' | 'denied' | 'error';
  ip: string;
  ms: number;
}

/**
 * Resolve the acting identity the same way the controllers do, so an audit line
 * and the `generated_by` stamp in a produced config always name the same person.
 * Falls back to 'unauthenticated', which is the real state when SSO is off.
 */
function resolveActor(req: Request): { actor: string; role: AuditEntry['role'] } {
  // req.oidc only exists while the OIDC middleware is mounted (SSO on).
  const user = (req as any).oidc?.user;
  const actor = user?.sub || user?.email || 'unauthenticated';
  return { actor, role: user ? 'authenticated' : 'unauthenticated' };
}

function outcomeFor(status: number): AuditEntry['outcome'] {
  if (status === 401 || status === 403) return 'denied';
  if (status >= 500) return 'error';
  return 'allowed';
}

/**
 * Express middleware. Mount after the authentication middleware (so the acting
 * identity is resolvable) and before the API routes.
 */
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();

  res.on('finish', () => {
    try {
      // A denial is always worth a line, whatever the method: it is the record
      // of someone reaching for something they were not entitled to.
      const denied = res.statusCode === 401 || res.statusCode === 403;
      if (!MUTATING.has(req.method) && !denied) return;

      const { actor, role } = resolveActor(req);
      const entry: AuditEntry = {
        ts: new Date().toISOString(),
        actor,
        role,
        method: req.method,
        // originalUrl, not path: the mounted prefix is part of the resource id.
        path: req.originalUrl,
        status: res.statusCode,
        outcome: outcomeFor(res.statusCode),
        // Trustworthy because `trust proxy` is 1 and nginx appends the real peer.
        ip: req.ip || '',
        ms: Date.now() - started,
      };
      console.log(`${AUDIT_PREFIX} ${JSON.stringify(entry)}`);
    } catch {
      // Never let auditing break a request that already succeeded. The response
      // has been sent by this point, so there is nothing to report to the client.
    }
  });

  next();
}
