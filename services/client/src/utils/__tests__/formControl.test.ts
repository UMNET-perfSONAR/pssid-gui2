// @vitest-environment jsdom
// Whether the interface lets you edit anything.
//
// This one function gates every form in the application, in both auth postures,
// and it is the place where the browser's view of policy can drift from the
// server's. Getting it wrong in either direction is bad and neither is loud: too
// permissive and the user fills in a form whose save is refused; too strict and a
// deployment that accepts writes greys out all of its own controls, which reads
// as the application being broken.

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { isFormDisabled } from '../formControl';
import { useUserStore } from '../../stores/user.store';
import config from '../../shared/config';

beforeEach(() => setActivePinia(createPinia()));

describe('the server\'s verdict settles it', () => {
  it('enables forms for write access', () => {
    const store = useUserStore();
    store.accessLevel = 'write';
    expect(isFormDisabled()).toBe(false);
  });

  it('disables forms for read access', () => {
    const store = useUserStore();
    store.accessLevel = 'read';
    expect(isFormDisabled()).toBe(true);
  });

  it('disables forms for no access', () => {
    const store = useUserStore();
    store.accessLevel = 'none';
    expect(isFormDisabled()).toBe(true);
  });

  it('outranks a stale local group mapping', () => {
    // The mapping compiled into the bundle can be out of date; the server's level
    // comes from the mapping its own authorize() middleware enforces. If the two
    // disagree the server is right, by definition -- it is the one refusing the
    // write.
    const store = useUserStore();
    store.user = { name: 'A', sub: '1', groups: ['pssid-gui'] };
    store.accessLevel = 'read';
    expect(isFormDisabled()).toBe(true);
  });

  it('outranks the compiled posture in the other direction too', () => {
    const store = useUserStore();
    store.ssoEnabled = false;
    store.openWrite = false;
    store.accessLevel = 'write';
    expect(isFormDisabled()).toBe(false);
  });
});

describe('before the identity request lands', () => {
  it('falls back to the posture the server reported', () => {
    const store = useUserStore();
    store.accessLevel = null;
    store.ssoEnabled = false;
    store.openWrite = true;
    expect(isFormDisabled()).toBe(false);

    store.openWrite = false;
    expect(isFormDisabled()).toBe(true);
  });

  it('falls back to the compiled defaults when the server said nothing', () => {
    // Both null means the request has not landed or failed. The compiled values
    // ship closed (SSO off, writes refused), so this is the safe direction.
    const store = useUserStore();
    store.accessLevel = null;
    store.ssoEnabled = null;
    store.openWrite = null;
    expect(isFormDisabled()).toBe(config.ENABLE_SSO ? true : config.OPEN_WRITE === false);
  });

  it('disables forms while SSO is on and nobody is signed in yet', () => {
    const store = useUserStore();
    store.accessLevel = null;
    store.ssoEnabled = true;
    store.user = null;
    expect(isFormDisabled()).toBe(true);
  });

  it('disables forms while the identity request is still in flight', () => {
    const store = useUserStore();
    store.accessLevel = null;
    store.ssoEnabled = true;
    store.isLoading = true;
    store.user = { name: 'A', sub: '1', groups: ['pssid-gui'] };
    expect(isFormDisabled()).toBe(true);
  });

  it('uses the local group mapping for a signed-in user on an older server', () => {
    // An older server sends no access_level; the compiled mapping is then the
    // only signal the browser has.
    const store = useUserStore();
    store.accessLevel = null;
    store.ssoEnabled = true;
    store.isLoading = false;
    store.user = { name: 'A', sub: '1', groups: ['pssid-gui'] };
    // 'pssid-gui' is mapped to write in the shipped mapping.
    expect(isFormDisabled()).toBe(false);

    store.user = { name: 'B', sub: '2', groups: ['not-a-mapped-group'] };
    expect(isFormDisabled()).toBe(true);
  });

  it('matches mapped group names case-insensitively, as the server does', () => {
    // The server folds case when matching; if the browser did not, a user whose
    // provider emits "PSSID-GUI" would see every form greyed out on a deployment
    // that accepts their writes.
    const store = useUserStore();
    store.accessLevel = null;
    store.ssoEnabled = true;
    store.user = { name: 'A', sub: '1', groups: ['PSSID-GUI'] };
    expect(isFormDisabled()).toBe(false);
  });
});
