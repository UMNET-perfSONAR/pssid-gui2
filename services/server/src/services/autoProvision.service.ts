// Auto-provision: when enabled, GUI edits to daemon-affecting collections are
// pushed to the probes automatically instead of requiring a manual
// "Configure selected host/group" click.
//
// Safety model (see docs/deployment.md):
//   * OFF by default — only runs when the operator turns it on in Settings.
//   * Debounced — a burst of edits collapses into a single Ansible run.
//   * Audited — every run is recorded in provision_history with trigger:'auto'.
//   * Reuses create_config_file, so the same script re-validation/sanitisation
//     that protects manual provisioning also protects auto runs.

import { Request, Response, NextFunction } from 'express';
import { create_config_file } from './config.service';
import { getSettings } from './settings.service';

// Quiet window: collapse rapid successive edits into one provision run.
const DEBOUNCE_MS = 5000;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
// The most recent change wins as the attributed caller for the batched run.
let lastCaller = 'auto';
let lastCallerRole = 'unauthenticated';
let lastReason = 'config change';

/**
 * Request an auto-provision. No-op unless the setting is enabled. Coalesces
 * concurrent calls within DEBOUNCE_MS into a single run.
 */
export async function triggerAutoProvision(
  caller: string,
  caller_role: string,
  reason: string
): Promise<void> {
  const { autoProvision } = await getSettings();
  if (!autoProvision) return;

  lastCaller = caller;
  lastCallerRole = caller_role;
  lastReason = reason;

  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(runAutoProvision, DEBOUNCE_MS);
}

async function runAutoProvision(): Promise<void> {
  pendingTimer = null;
  if (running) {
    // A run is already in flight; schedule one more pass so the latest edits
    // are not lost.
    pendingTimer = setTimeout(runAutoProvision, DEBOUNCE_MS);
    return;
  }
  running = true;
  try {
    console.log(`Auto-provision firing (reason: ${lastReason}, caller: ${lastCaller})`);
    // Provision all hosts ('*') from the current DB state. click_context 'auto'
    // and trigger 'auto' make the run identifiable in provision history.
    await create_config_file('*', 'auto', lastCaller, lastCallerRole, 'auto');
  } catch (err) {
    console.error('Auto-provision run failed:', err);
  } finally {
    running = false;
  }
}

/**
 * Express middleware: after a successful write request to a daemon-affecting
 * router, request an auto-provision. Mount it ahead of those routers in
 * index.ts. Read requests and the explicit provisioning endpoints are skipped.
 */
export function autoProvisionOnWrite(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  // Skip the explicit provisioning endpoints (e.g. /config) — they already
  // provision, so auto-firing would be redundant.
  const isProvisionEndpoint = /config|provision/i.test(req.path);

  if (isWrite && !isProvisionEndpoint) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const oidcUser = (req as any).oidc?.user;
        const caller: string = oidcUser?.sub || oidcUser?.email || 'unauthenticated';
        const caller_role: string = oidcUser ? 'authenticated' : 'unauthenticated';
        // Fire-and-forget; failures are logged inside triggerAutoProvision.
        triggerAutoProvision(caller, caller_role, `${method} ${req.originalUrl}`).catch((err) =>
          console.error('Auto-provision trigger error:', err)
        );
      }
    });
  }

  next();
}
