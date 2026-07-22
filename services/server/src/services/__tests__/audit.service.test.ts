import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auditLog, AUDIT_PREFIX } from '../audit.service';

/**
 * Drive the middleware the way express does: call it, then fire the response's
 * 'finish' event, which is when the entry is written.
 */
function run(
  reqOverrides: Record<string, any>,
  statusCode: number
): { entries: any[]; nextCalled: boolean } {
  const finishHandlers: Array<() => void> = [];
  const res: any = {
    statusCode,
    on(event: string, handler: () => void) {
      if (event === 'finish') finishHandlers.push(handler);
    },
  };
  const req: any = {
    method: 'GET',
    originalUrl: '/api/hosts',
    ip: '10.0.0.9',
    ...reqOverrides,
  };

  const logged: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((msg?: any) => {
    logged.push(String(msg));
  });

  let nextCalled = false;
  auditLog(req, res, () => {
    nextCalled = true;
  });
  finishHandlers.forEach((h) => h());
  spy.mockRestore();

  const entries = logged
    .filter((l) => l.startsWith(AUDIT_PREFIX))
    .map((l) => JSON.parse(l.slice(AUDIT_PREFIX.length + 1)));
  return { entries, nextCalled };
}

describe('auditLog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes the request through immediately', () => {
    const { nextCalled } = run({ method: 'POST' }, 200);
    expect(nextCalled).toBe(true);
  });

  it('records every state-changing method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { entries } = run({ method }, 200);
      expect(entries, `${method} should be audited`).toHaveLength(1);
      expect(entries[0].method).toBe(method);
      expect(entries[0].outcome).toBe('allowed');
    }
  });

  it('stays silent for ordinary reads, which would otherwise drown the trail', () => {
    const { entries } = run({ method: 'GET' }, 200);
    expect(entries).toHaveLength(0);
  });

  it('records a denial even on a read: an attempted access is the point', () => {
    for (const status of [401, 403]) {
      const { entries } = run({ method: 'GET' }, status);
      expect(entries, `status ${status} should be audited`).toHaveLength(1);
      expect(entries[0].outcome).toBe('denied');
    }
  });

  it('attributes the OIDC subject when SSO is on', () => {
    const { entries } = run(
      { method: 'DELETE', oidc: { user: { sub: 'okta|abc123' } } },
      200
    );
    expect(entries[0].actor).toBe('okta|abc123');
    expect(entries[0].role).toBe('authenticated');
  });

  it('falls back to email, then to unauthenticated', () => {
    const withEmail = run(
      { method: 'POST', oidc: { user: { email: 'a@example.edu' } } },
      200
    );
    expect(withEmail.entries[0].actor).toBe('a@example.edu');

    const anonymous = run({ method: 'POST' }, 200);
    expect(anonymous.entries[0].actor).toBe('unauthenticated');
    expect(anonymous.entries[0].role).toBe('unauthenticated');
  });

  it('flags server faults separately from denials', () => {
    const { entries } = run({ method: 'POST' }, 500);
    expect(entries[0].outcome).toBe('error');
  });

  it('never copies request bodies into the trail', () => {
    const secret = 'super-secret-psk';
    const { entries } = run(
      { method: 'POST', body: { SSID: 'x', password: secret } },
      200
    );
    expect(JSON.stringify(entries[0])).not.toContain(secret);
    expect(entries[0]).not.toHaveProperty('body');
  });

  it('identifies the resource by its full mounted path', () => {
    const { entries } = run(
      { method: 'DELETE', originalUrl: '/api/hosts/probe-1' },
      200
    );
    expect(entries[0].path).toBe('/api/hosts/probe-1');
  });

  it('cannot break a request if logging throws', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('stdout is gone');
    });
    const finishHandlers: Array<() => void> = [];
    const res: any = {
      statusCode: 200,
      on: (e: string, h: () => void) => {
        if (e === 'finish') finishHandlers.push(h);
      },
    };
    let nextCalled = false;
    auditLog({ method: 'POST', originalUrl: '/api/hosts', ip: '' } as any, res, () => {
      nextCalled = true;
    });
    expect(() => finishHandlers.forEach((h) => h())).not.toThrow();
    expect(nextCalled).toBe(true);
    spy.mockRestore();
  });
});
