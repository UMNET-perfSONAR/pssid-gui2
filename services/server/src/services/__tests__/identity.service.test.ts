import { describe, it, expect } from 'vitest';
import { callerFromClaims, UNAUTHENTICATED_CALLER } from '../identity.service';

/**
 * The acting identity ends up in a config file deployed to the probes and in
 * the audit log, so every field has to be populated whatever a provider
 * releases -- a deployment picks its own SSO_SCOPE, and dropping `profile`
 * removes both human-readable claims.
 */
describe('callerFromClaims', () => {
  it('reads name, short login and immutable id from a full claim set', () => {
    expect(
      callerFromClaims({
        sub: '00u22pf9jgqqsnqaQ1d8',
        name: 'Alex Rivera',
        preferred_username: 'arivera@example.edu',
        email: 'alex.rivera@example.edu',
      })
    ).toEqual({
      name: 'Alex Rivera',
      uid: 'arivera',
      okta_uid: '00u22pf9jgqqsnqaQ1d8',
      role: 'authenticated',
    });
  });

  it('is unauthenticated when there is no user (SSO off)', () => {
    expect(callerFromClaims(undefined)).toEqual(UNAUTHENTICATED_CALLER);
    expect(callerFromClaims(null)).toEqual(UNAUTHENTICATED_CALLER);
  });

  it('falls back to email when the provider sends no preferred_username', () => {
    const caller = callerFromClaims({ sub: '00u1', email: 'arivera@example.edu' });
    expect(caller.uid).toBe('arivera');
    expect(caller.name).toBe('arivera@example.edu');
  });

  it('never leaves a field blank when only sub is released', () => {
    expect(callerFromClaims({ sub: '00u1' })).toEqual({
      name: '00u1',
      uid: '00u1',
      okta_uid: '00u1',
      role: 'authenticated',
    });
  });

  it('keeps a login that is not an email address whole', () => {
    expect(callerFromClaims({ sub: '00u1', preferred_username: 'arivera' }).uid).toBe('arivera');
  });

  it('does not strip a leading @ into an empty uid', () => {
    // A malformed claim must not produce an empty identity field: the fallback
    // to sub has to survive it.
    expect(callerFromClaims({ sub: '00u1', preferred_username: '@example.edu' }).uid).toBe('00u1');
  });
});
