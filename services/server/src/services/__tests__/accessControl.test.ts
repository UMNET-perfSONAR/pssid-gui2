// Authorization is the control everything else rests on, so its edges are tested
// directly: which claim a group arrives in, how it is matched, and -- most
// importantly -- that every failure denies rather than allows.
//
// The module under test lives in the repo-root shared/ directory and is staged
// into src/shared at build time. It is exercised through AUTH_GROUPS_FILE so each
// case gets its own fixture: rewriting the real mapping would race the other test
// files, which vitest runs in parallel workers.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let fixtureDir: string;
let fixturePath: string;

async function loadModule() {
  vi.resetModules();
  return import('../../shared/accessControl');
}

function writeMapping(contents: unknown): void {
  fs.writeFileSync(
    fixturePath,
    typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
  );
}

/**
 * Minimal Express double: records what the middleware did. `sessionGroups`
 * stands for the list resolved at sign-in and stored on the session, which is
 * where groups live when the provider released them from userinfo rather than in
 * the ID token.
 */
function fakeExchange(oidcUser: unknown | null, sessionGroups?: unknown) {
  const res = {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  const req: Record<string, unknown> = {
    oidc: oidcUser === null ? undefined : { isAuthenticated: () => true, user: oidcUser },
  };
  if (sessionGroups !== undefined) {
    req['pssid_session'] = { pssid_groups: sessionGroups };
  }
  return { req: req as any, res: res as any, next: vi.fn() };
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pssid-authz-'));
  fixturePath = path.join(fixtureDir, 'auth-groups.config.json');
  process.env.AUTH_GROUPS_FILE = fixturePath;
  delete process.env.ENABLE_SSO;
  delete process.env.OPEN_WRITE;
});

afterEach(() => {
  delete process.env.AUTH_GROUPS_FILE;
  delete process.env.ENABLE_SSO;
  delete process.env.OPEN_WRITE;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('resolveUserGroups', () => {
  it('reads the standard OIDC groups claim (Okta, Entra ID)', async () => {
    const { resolveUserGroups } = await loadModule();
    expect(resolveUserGroups({ groups: ['net-admins', 'everyone'] })).toEqual([
      'net-admins',
      'everyone',
    ]);
  });

  it('reads the eduPerson claim a federated tenant sends instead', async () => {
    const { resolveUserGroups } = await loadModule();
    expect(resolveUserGroups({ edumember_is_member_of: ['staff'] })).toEqual(['staff']);
  });

  it('reads the Shibboleth/Grouper isMemberOf claim', async () => {
    const { resolveUserGroups } = await loadModule();
    expect(resolveUserGroups({ isMemberOf: ['wifi-eng'] })).toEqual(['wifi-eng']);
  });

  it('MERGES every claim rather than letting the first one win', async () => {
    // A tenant can legitimately release more than one. Taking only the first
    // would silently drop the membership that grants access.
    const { resolveUserGroups } = await loadModule();
    expect(
      resolveUserGroups({ groups: ['a'], edumember_is_member_of: ['b'], isMemberOf: ['c'] })
    ).toEqual(['a', 'b', 'c']);
  });

  it('accepts a single string, which some providers send instead of an array', async () => {
    const { resolveUserGroups } = await loadModule();
    expect(resolveUserGroups({ groups: 'lone-group' })).toEqual(['lone-group']);
  });

  it('de-duplicates case-insensitively and drops blanks and non-strings', async () => {
    const { resolveUserGroups } = await loadModule();
    expect(
      resolveUserGroups({ groups: ['Admins', 'admins', '  ', 42, null, ' spaced '] })
    ).toEqual(['Admins', 'spaced']);
  });

  it('returns nothing for a missing or non-object identity', async () => {
    const { resolveUserGroups } = await loadModule();
    expect(resolveUserGroups(null)).toEqual([]);
    expect(resolveUserGroups(undefined)).toEqual([]);
    expect(resolveUserGroups('nope')).toEqual([]);
    expect(resolveUserGroups({})).toEqual([]);
  });
});

describe('getUserAccessLevel', () => {
  it('takes the HIGHEST level across a user\'s groups', async () => {
    writeMapping({ permissions: { readers: 'read', writers: 'write' } });
    const { getUserAccessLevel } = await loadModule();
    expect(getUserAccessLevel(['readers', 'writers'])).toBe('write');
    expect(getUserAccessLevel(['readers'])).toBe('read');
  });

  it('matches group names case-insensitively', async () => {
    // Directory group names arrive with inconsistent case; an operator
    // transcribing "PSSID-GUI" from a provider console must not silently end up
    // with no access.
    writeMapping({ permissions: { 'Net-Admins': 'write' } });
    const { getUserAccessLevel } = await loadModule();
    expect(getUserAccessLevel(['net-admins'])).toBe('write');
    expect(getUserAccessLevel(['NET-ADMINS'])).toBe('write');
    expect(getUserAccessLevel([' net-admins '])).toBe('write');
  });

  it('does NOT match by prefix or suffix', async () => {
    // Suffix matching would hand write access to a group nobody configured --
    // mapping "pssid-gui" would also match "pssid-gui-readonly".
    writeMapping({ permissions: { 'pssid-gui': 'write' } });
    const { getUserAccessLevel } = await loadModule();
    expect(getUserAccessLevel(['pssid-gui-readonly'])).toBe('none');
    expect(getUserAccessLevel(['urn:mace:example.edu:group:pssid-gui'])).toBe('none');
  });

  it('denies an unmapped group', async () => {
    writeMapping({ permissions: { writers: 'write' } });
    const { getUserAccessLevel } = await loadModule();
    expect(getUserAccessLevel(['some-other-group'])).toBe('none');
    expect(getUserAccessLevel([])).toBe('none');
  });

  it('accepts the legacy boolean/"true" spellings of write', async () => {
    writeMapping({ permissions: { legacyBool: true, legacyString: 'true', off: false } });
    const { getUserAccessLevel } = await loadModule();
    expect(getUserAccessLevel(['legacyBool'])).toBe('write');
    expect(getUserAccessLevel(['legacyString'])).toBe('write');
    expect(getUserAccessLevel(['off'])).toBe('none');
  });
});

describe('a broken mapping file fails CLOSED', () => {
  it('does not fall back to the bundled mapping when AUTH_GROUPS_FILE is wrong', async () => {
    // Regression: the override used to sit in FRONT of the built-in paths, so a
    // typo or a mount that did not land fell through to the file baked into the
    // image -- which maps the example group `pssid-gui` to write. An operator
    // would have been granting write access through a group they never
    // configured, with no error and a passing startup gate.
    process.env.AUTH_GROUPS_FILE = path.join(fixtureDir, 'does-not-exist.json');
    process.env.ENABLE_SSO = 'true';
    const { getUserAccessLevel, permissionMappingStatus, validatePermissionMapping } =
      await loadModule();

    expect(getUserAccessLevel(['pssid-gui'])).toBe('none');
    expect(permissionMappingStatus().error).toMatch(/not found/i);
    expect(validatePermissionMapping()).toMatch(/unusable/i);
  });

  it('names only the configured path when the override is set', async () => {
    // The error must point at the operator's path, not list the internal
    // fallbacks they did not ask for.
    process.env.AUTH_GROUPS_FILE = path.join(fixtureDir, 'nope.json');
    const { permissionMappingStatus } = await loadModule();
    const { error } = permissionMappingStatus();
    expect(error).toContain('nope.json');
    expect(error).not.toContain('src/shared');
  });

  it('grants nothing when the JSON is malformed', async () => {
    writeMapping('{ this is not json');
    const { getUserAccessLevel, permissionMappingStatus } = await loadModule();
    expect(getUserAccessLevel(['anything'])).toBe('none');
    expect(permissionMappingStatus().error).toBeTruthy();
  });

  it('grants nothing when "permissions" is the wrong shape', async () => {
    writeMapping({ permissions: ['writers'] });
    const { getUserAccessLevel, permissionMappingStatus } = await loadModule();
    expect(getUserAccessLevel(['writers'])).toBe('none');
    expect(permissionMappingStatus().error).toBeTruthy();
  });

  it('grants nothing -- not even the valid entries -- on an unrecognized level', async () => {
    // A typo like "wrote" must not leave a half-applied policy in force.
    writeMapping({ permissions: { writers: 'wrote', readers: 'read' } });
    const { getUserAccessLevel, permissionMappingStatus } = await loadModule();
    expect(getUserAccessLevel(['readers'])).toBe('none');
    expect(permissionMappingStatus().error).toMatch(/unrecognized permission level/i);
  });
});

describe('validatePermissionMapping (the startup gate)', () => {
  it('passes when SSO is off, whatever the mapping says', async () => {
    // The mapping is unused in that posture, so a missing file is not a fault.
    writeMapping('not json at all');
    process.env.ENABLE_SSO = 'false';
    const { validatePermissionMapping } = await loadModule();
    expect(validatePermissionMapping()).toBeNull();
  });

  it('refuses an SSO deployment whose mapping is unusable', async () => {
    writeMapping('not json at all');
    process.env.ENABLE_SSO = 'true';
    const { validatePermissionMapping } = await loadModule();
    expect(validatePermissionMapping()).toMatch(/unusable/i);
  });

  it('refuses an SSO deployment whose mapping is empty', async () => {
    // Every authenticated user would be denied, which looks identical to a
    // broken application from the outside.
    writeMapping({ permissions: {} });
    process.env.ENABLE_SSO = 'true';
    const { validatePermissionMapping } = await loadModule();
    expect(validatePermissionMapping()).toMatch(/empty/i);
  });

  it('allows a read-only SSO deployment (no write group is a valid choice)', async () => {
    writeMapping({ permissions: { readers: 'read' } });
    process.env.ENABLE_SSO = 'true';
    const { validatePermissionMapping } = await loadModule();
    expect(validatePermissionMapping()).toBeNull();
  });
});

describe('authorize() with SSO off', () => {
  beforeEach(() => writeMapping({ permissions: { writers: 'write' } }));

  it('allows reads', async () => {
    process.env.ENABLE_SSO = 'false';
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange(null);
    await authorize('read')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('refuses writes unless OPEN_WRITE is set', async () => {
    process.env.ENABLE_SSO = 'false';
    process.env.OPEN_WRITE = 'false';
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange(null);
    await authorize('write')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('allows writes when OPEN_WRITE is set', async () => {
    process.env.ENABLE_SSO = 'false';
    process.env.OPEN_WRITE = 'true';
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange(null);
    await authorize('write')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('authorize() with SSO on', () => {
  beforeEach(() => {
    process.env.ENABLE_SSO = 'true';
    writeMapping({ permissions: { readers: 'read', writers: 'write' } });
  });

  it('answers 401 -- not 403 -- when there is no session', async () => {
    // The distinction is the whole point: 401 means signing in may help, and is
    // what lets the browser start the flow. 403 means it never will.
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange(null);
    await authorize('read')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.login_url).toBe('/login');
  });

  it('allows a write for a mapped write group', async () => {
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['writers'] });
    await authorize('write')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('refuses a write for a read-only group', async () => {
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['readers'] });
    await authorize('write')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('refuses everything for an authenticated user with no mapped group', async () => {
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['unrelated'] });
    await authorize('read')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/not a member of any group/i);
  });

  it('does not echo the caller\'s group names back in the denial', async () => {
    // The caller already knows their own groups, but repeating them invites
    // treating the error as a probe for which group names exist here.
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['secret-group-name'] });
    await authorize('write')(req, res, next);
    expect(JSON.stringify(res.body)).not.toContain('secret-group-name');
  });

  it('uses the groups stored at sign-in when the ID token carries none', async () => {
    // Regression, and the reason SESSION_GROUPS_KEY exists. req.oidc.user is
    // rebuilt from the ID token on every request, so a provider that releases
    // groups only from its userinfo endpoint yields an identity with no groups
    // at all. Login succeeded (oidc.service resolved them from userinfo); without
    // reading them back here every subsequent request 403s, and the user sees a
    // working sign-in followed by an application that refuses everything.
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1' }, ['writers']);
    await authorize('write')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  it('still denies when the stored list maps to nothing', async () => {
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1' }, ['unrelated']);
    await authorize('read')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('falls back to the token claims when nothing was stored', async () => {
    // Sessions created before the stored list existed must keep working.
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['writers'] });
    await authorize('write')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('ignores a malformed stored list rather than trusting it', async () => {
    const { authorize } = await loadModule();
    for (const junk of ['writers', { writers: true }, [42, null]]) {
      const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['writers'] }, junk);
      await authorize('write')(req, res, next);
      // Falls through to the token claims, which do grant write.
      expect(next).toHaveBeenCalled();
    }
  });

  it('ignores OPEN_WRITE entirely -- it is not a bypass for SSO', async () => {
    process.env.OPEN_WRITE = 'true';
    const { authorize } = await loadModule();
    const { req, res, next } = fakeExchange({ sub: 'u1', groups: ['readers'] });
    await authorize('write')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
