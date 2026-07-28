// Auto-provision: when enabled, GUI edits to daemon-affecting collections are
// pushed to the probes automatically instead of requiring a manual
// "Configure selected host/group" click.
//
// Safety model (see docs/deployment.md):
//   * OFF by default, only runs when the operator turns it on in Settings.
//   * Debounced, a burst of edits collapses into a single Ansible run.
//   * Reuses create_config_file, so the same script re-validation/sanitisation
//     that protects manual provisioning also protects auto runs.

import { Request, Response, NextFunction } from 'express';
import { create_config_file } from './config.service';
import { forLog } from './log.service';
import { getSettings } from './settings.service';

// Quiet window: collapse rapid successive edits into one provision run.
//
// The timer RESTARTS on every edit and has no maximum wait, so a burst of
// changes arriving closer together than this postpones provisioning until the
// burst ends -- a bulk import could defer it for as long as the import runs.
//
// That is deliberate and accepted: how long provisioning takes to happen is not
// a constraint for this deployment, and one run after the last edit is preferred
// to a series of runs against half-applied state. Nothing is lost by waiting --
// an edit that lands mid-run schedules another pass (see runAutoProvision), so
// the probes always end up at the latest configuration.
//
// Please do not add a max-wait or a "provision at least every N seconds" rule to
// this; it would trade the property above for a speed nobody asked for.
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
    // forLog: the reason is a request URL and the caller an identity-provider
    // claim, neither of which may be trusted to stay on one log line.
    console.log('Auto-provision firing (reason: %s, caller: %s)', forLog(lastReason), forLog(lastCaller));
    // Provision all hosts ('*') from the current DB state.
    await create_config_file('*', 'auto', lastCaller, lastCallerRole);
  } catch (err) {
    console.error('Auto-provision run failed:', err);
  } finally {
    running = false;
  }
}

/**
 * Is this the router's own explicit provisioning endpoint (POST /config on the
 * hosts and host-groups routers)? Those provision already, so auto-firing after
 * them would duplicate the run.
 *
 * Matches a whole path SEGMENT, never a substring. The path given here is
 * relative to the router's mount point, and seven of these routes are
 * `DELETE /:name` -- so the object's own name IS the path. A substring test
 * silently skipped auto-provisioning for anything an operator happened to call
 * "config-probe-1" or "test-provisioning", leaving those probes stale while
 * identical edits to differently-named objects went through.
 */
export function isExplicitProvisionPath(path: string): boolean {
  return /^\/(config|provision)(\/|$)/i.test(path);
}

/**
 * Express middleware: after a successful write request to a daemon-affecting
 * router, request an auto-provision. Mount it ahead of those routers in
 * index.ts. Read requests and the explicit provisioning endpoints are skipped.
 */
export function autoProvisionOnWrite(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const isProvisionEndpoint = isExplicitProvisionPath(req.path);

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
