// Which write requests trigger an automatic provision.
//
// The interesting cases are all about the path the middleware sees. It is
// mounted per router (app.use("/api/hosts", autoProvisionOnWrite, hostroute)),
// so req.path is relative to that mount point -- and because seven of these
// routes are `DELETE /:name`, the object's own name arrives here AS the path.
// Anything matching on a substring therefore makes auto-provisioning depend on
// what the operator named the object, which is the bug these tests pin down.

import { describe, it, expect } from 'vitest';
import { isExplicitProvisionPath } from '../autoProvision.service';

describe('isExplicitProvisionPath: the endpoints that provision themselves', () => {
  it('skips POST /config, which hosts and host-groups both expose', () => {
    expect(isExplicitProvisionPath('/config')).toBe(true);
    expect(isExplicitProvisionPath('/config/')).toBe(true);
  });

  it('skips a /provision path', () => {
    expect(isExplicitProvisionPath('/provision')).toBe(true);
    expect(isExplicitProvisionPath('/provision/preview')).toBe(true);
  });
});

describe('isExplicitProvisionPath: object names must not change behaviour', () => {
  // Each of these is a legal object name (the validators allow letters, digits
  // and hyphens), arriving as the path of a DELETE. Treating any of them as a
  // provisioning endpoint means the delete lands in the database and the probes
  // are never told -- silently, and only for objects named this way.
  it.each([
    '/config-probe-1',
    '/my-config',
    '/preconfigured-batch',
    '/test-provisioning',
    '/provisioning-notes',
    '/reconfigure',
  ])('does not skip %s', (path) => {
    expect(isExplicitProvisionPath(path)).toBe(false);
  });

  it('does not skip the ordinary write endpoints', () => {
    for (const p of ['/create-host', '/update-host', '/', '/rpi4', '/batch-tie']) {
      expect(isExplicitProvisionPath(p)).toBe(false);
    }
  });
});
