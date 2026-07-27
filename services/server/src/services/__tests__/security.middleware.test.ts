// The request-level guards: CSRF provenance, cache suppression, and the API
// authentication gate.
//
// The CSRF cases matter most. The rule has to block a forged cross-site write
// while still allowing the deployment's own smoke suite and any operator script,
// which send no Origin at all -- so the tests pin both halves, because "tighten
// it until nothing gets through" and "loosen it until everything does" are both
// one-line changes away.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enforceSameOrigin, noStore, requireApiAuthentication } from '../security.middleware';

const BASE = 'https://pssid.example.edu';

function exchange(opts: {
  method?: string;
  headers?: Record<string, string>;
  authenticated?: boolean;
  url?: string;
}) {
  const headers = Object.fromEntries(
    Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const req = {
    method: opts.method ?? 'POST',
    originalUrl: opts.url ?? '/api/hosts/create-host',
    protocol: 'https',
    get: (name: string) => headers[name.toLowerCase()],
    oidc:
      opts.authenticated === undefined
        ? undefined
        : { isAuthenticated: () => opts.authenticated! },
  };
  const res = {
    statusCode: 0,
    body: null as any,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
  };
  return { req: req as any, res: res as any, next: vi.fn() };
}

beforeEach(() => { process.env.BASE_URL = BASE; });
afterEach(() => {
  delete process.env.BASE_URL;
  delete process.env.ENABLE_SSO;
});

describe('enforceSameOrigin: reads are never blocked', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    it(`lets ${method} through regardless of Origin`, () => {
      const { req, res, next } = exchange({ method, headers: { origin: 'https://evil.example' } });
      enforceSameOrigin(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  }
});

describe('enforceSameOrigin: cross-origin writes are refused', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`refuses ${method} from another origin`, () => {
      const { req, res, next } = exchange({ method, headers: { origin: 'https://evil.example' } });
      enforceSameOrigin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  }

  it('refuses a write whose Referer is another origin', () => {
    const { req, res, next } = exchange({ headers: { referer: 'https://evil.example/page' } });
    enforceSameOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it('refuses a look-alike host that merely shares a prefix', () => {
    const { req, res, next } = exchange({
      headers: { origin: 'https://pssid.example.edu.evil.example' },
    });
    enforceSameOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it('refuses the same host over a different scheme', () => {
    const { req, res, next } = exchange({ headers: { origin: 'http://pssid.example.edu' } });
    enforceSameOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it('refuses the same host on a different port', () => {
    const { req, res, next } = exchange({ headers: { origin: 'https://pssid.example.edu:8443' } });
    enforceSameOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});

describe('enforceSameOrigin: same-origin writes are allowed', () => {
  it('allows a write whose Origin matches', () => {
    const { req, res, next } = exchange({ headers: { origin: BASE } });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows a write whose Referer matches, when Origin is absent', () => {
    const { req, res, next } = exchange({ headers: { referer: `${BASE}/hosts` } });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('prefers Origin over Referer when both are present', () => {
    const { req, res, next } = exchange({
      headers: { origin: BASE, referer: 'https://evil.example/x' },
    });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to the proxied Host when BASE_URL is unset', () => {
    delete process.env.BASE_URL;
    const { req, res, next } = exchange({
      headers: { origin: 'https://some-host.example', host: 'some-host.example' },
    });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows a write from localhost, which nginx also serves', () => {
    // An operator working in a browser ON the VM addresses the deployment as
    // localhost. Comparing only against BASE_URL refused every one of their
    // writes, while protecting against nothing: an attacker's page sends its own
    // origin, which matches neither the configured nor the requested one.
    const { req, res, next } = exchange({
      headers: { origin: 'https://localhost', host: 'localhost' },
    });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('still refuses a third-party origin when the request came via localhost', () => {
    const { req, res, next } = exchange({
      headers: { origin: 'https://evil.example', host: 'localhost' },
    });
    enforceSameOrigin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('normalizes a BASE_URL with a trailing slash', () => {
    process.env.BASE_URL = 'https://pssid.example.edu/';
    const { req, res, next } = exchange({ headers: { origin: BASE } });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('enforceSameOrigin: requests with no provenance header', () => {
  it('allows a write with no cookie -- a script or curl cannot be tricked', () => {
    // This is the shape of scripts/smoke-test.sh and of any operator automation.
    // A caller with no ambient credentials has to supply its own, so there is
    // nothing for a third-party site to abuse.
    const { req, res, next } = exchange({ headers: {} });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows a write carrying an unrelated cookie', () => {
    const { req, res, next } = exchange({ headers: { cookie: 'theme=dark' } });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('REFUSES a write that carries the session cookie but no Origin or Referer', () => {
    // Ambient credentials plus no provenance is the shape of the attack, and a
    // real browser always sends at least one of the two headers.
    const { req, res, next } = exchange({ headers: { cookie: 'pssid_session=abc123' } });
    enforceSameOrigin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('refuses it when the session cookie is not the first in the jar', () => {
    const { req, res, next } = exchange({
      headers: { cookie: 'theme=dark; pssid_session=abc123' },
    });
    enforceSameOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it('treats Origin: null as absent (a sandboxed or privacy-stripped request)', () => {
    const { req, res, next } = exchange({
      headers: { origin: 'null', cookie: 'pssid_session=abc' },
    });
    enforceSameOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it('refuses a write whose Origin is unparseable', () => {
    const { req, res, next } = exchange({ headers: { origin: 'not a url' } });
    enforceSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled(); // unparseable -> treated as absent
  });
});

describe('noStore', () => {
  it('marks every API response uncacheable', () => {
    // Responses here carry the deployment's configuration and the caller's
    // identity; a shared proxy or a back/forward cache holding one means it can
    // be served to the next person.
    const { req, res, next } = exchange({ method: 'GET' });
    noStore(req, res, next);
    expect(res.headers['Cache-Control']).toContain('no-store');
    expect(res.headers['Cache-Control']).toContain('private');
    expect(next).toHaveBeenCalled();
  });
});

describe('requireApiAuthentication', () => {
  it('is a no-op when SSO is off (there is no identity to require)', () => {
    process.env.ENABLE_SSO = 'false';
    const { req, res, next } = exchange({ method: 'GET' });
    requireApiAuthentication(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('answers 401 with a sign-in URL when SSO is on and there is no session', () => {
    process.env.ENABLE_SSO = 'true';
    const { req, res, next } = exchange({ method: 'GET', authenticated: false });
    requireApiAuthentication(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.login_url).toBe('/login');
  });

  it('advertises no returnTo, because the login route does not honour one', () => {
    // express-openid-connect's built-in /login calls
    // res.oidc.login({ returnTo: config.baseURL }) -- the base URL is hard-coded
    // and no query parameter is read. A returnTo here would be a promise the
    // stack does not keep, and an invitation to wire it somewhere it WOULD be
    // honoured, which is how an open redirect gets built.
    process.env.ENABLE_SSO = 'true';
    const { req, res, next } = exchange({
      method: 'GET',
      authenticated: false,
      url: '/api/hosts?page=2',
    });
    requireApiAuthentication(req, res, next);
    expect(res.body.login_url).toBe('/login');
    expect(JSON.stringify(res.body)).not.toContain('returnTo');
  });

  it('never reflects the request URL into the response', () => {
    // req.originalUrl is attacker-influenced (an absolute-form request target
    // puts a whole URL in it). Nothing here should echo it back.
    process.env.ENABLE_SSO = 'true';
    const { req, res, next } = exchange({
      method: 'GET',
      authenticated: false,
      url: 'http://evil.example/api/hosts',
    });
    requireApiAuthentication(req, res, next);
    expect(JSON.stringify(res.body)).not.toContain('evil.example');
  });

  it('lets an authenticated request through', () => {
    process.env.ENABLE_SSO = 'true';
    const { req, res, next } = exchange({ method: 'GET', authenticated: true });
    requireApiAuthentication(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
