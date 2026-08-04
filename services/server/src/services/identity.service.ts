// Who is acting: one resolution of the OIDC claims, shared by everything that
// has to name a person.
//
// Three places record the acting identity -- the audit line, the
// `pssid_metadata` provenance block in a generated config, and the argument
// vector handed to the provision script -- and they must agree. They used to
// derive it independently from `req.oidc.user`, four copies of the same
// expression, so a change to one silently disagreed with the others about who
// did something. This is the single definition.

import { Request } from 'express';

/**
 * The acting identity.
 *
 * Three identifiers rather than one, because they answer different questions.
 * `okta_uid` is the provider's immutable user id and is the only one safe to
 * correlate on: it never changes for a given person, while a display name or a
 * login can. `name` and `uid` exist so a generated config can be read by a human
 * without a lookup against the identity provider.
 */
export interface Caller {
  /** Display name from the provider's `name` claim. */
  name: string;
  /** Login with any domain removed -- the short username an operator recognises. */
  uid: string;
  /** The provider's immutable user id: the OIDC `sub`. */
  okta_uid: string;
  role: 'authenticated' | 'unauthenticated';
}

/**
 * The real state when SSO is off, and the safe default anywhere a Caller is
 * optional: nothing here should ever read as a person who did not act.
 */
export const UNAUTHENTICATED_CALLER: Caller = Object.freeze({
  name: 'unauthenticated',
  uid: 'unauthenticated',
  okta_uid: 'unauthenticated',
  role: 'unauthenticated',
});

/**
 * Resolve a Caller from OIDC claims.
 *
 * Every field falls back rather than going empty, because a deployment chooses
 * its own SSO_SCOPE: drop `profile` and there is no `name` or
 * `preferred_username` to read, and the provenance block would otherwise ship
 * blanks. `sub` is required of every OIDC provider, so it is the last resort for
 * the two human-readable fields and the first choice for the id.
 *
 * Exported separately from resolveCaller so the fallback chain is testable
 * without constructing an Express request.
 */
export function callerFromClaims(user: any): Caller {
  if (!user) return UNAUTHENTICATED_CALLER;

  const login: string = user.preferred_username || user.email || '';
  // Providers hand back the login as a full principal (user@example.edu); the
  // short form is what appears in tickets and on the probes' own accounts.
  // A login with no '@' is already short. One that STARTS with '@' is
  // malformed and slices to '', which the fallback below then replaces --
  // an empty identity field is the one outcome not allowed here.
  const at = login.indexOf('@');
  const short = at >= 0 ? login.slice(0, at) : login;

  return {
    name: user.name || login || user.sub || 'unknown',
    uid: short || user.sub || 'unknown',
    okta_uid: user.sub || login || 'unknown',
    role: 'authenticated',
  };
}

/** Resolve a Caller from a request. `req.oidc` exists only while SSO is on. */
export function resolveCaller(req: Request): Caller {
  return callerFromClaims((req as any).oidc?.user);
}
