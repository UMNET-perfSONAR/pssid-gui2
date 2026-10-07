import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../settings.service', () => ({ getSettings: vi.fn() }));
vi.mock('../config.service', () => ({ create_config_file: vi.fn() }));

describe('automatic provisioning lifecycle', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('does not run queued work after the operator disables automatic provisioning', async () => {
    const { getSettings } = await import('../settings.service');
    const { create_config_file } = await import('../config.service');
    const { triggerAutoProvision } = await import('../autoProvision.service');
    vi.mocked(getSettings).mockResolvedValue({ autoProvision: true });
    await triggerAutoProvision({ name: 'test', uid: 'test', okta_uid: 'test', role: 'unauthenticated' }, 'edit');
    vi.mocked(getSettings).mockResolvedValue({ autoProvision: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(create_config_file).not.toHaveBeenCalled();
  });

  it('queues a refresh when an object named config is deleted', async () => {
    const { getSettings } = await import('../settings.service');
    const { create_config_file } = await import('../config.service');
    const { autoProvisionOnWrite } = await import('../autoProvision.service');
    vi.mocked(getSettings).mockResolvedValue({ autoProvision: true });
    vi.mocked(create_config_file).mockResolvedValue(undefined);
    let finish: (() => void) | undefined;
    const req = { method: 'DELETE', path: '/config', originalUrl: '/api/hosts/config' };
    const res = { statusCode: 200, on: (_event: string, cb: () => void) => { finish = cb; } };
    autoProvisionOnWrite(req as any, res as any, vi.fn());
    expect(finish).toBeDefined();
    finish!();
    await vi.advanceTimersByTimeAsync(5000);
    expect(create_config_file).toHaveBeenCalledOnce();
  });
});
