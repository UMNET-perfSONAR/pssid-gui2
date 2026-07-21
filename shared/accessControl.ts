import fs from 'fs';
import path from 'path';
import config from './config';
import { Request, Response, NextFunction } from 'express';

interface PermissionsConfig {
  permissions: Record<string, 'none' | 'read' | 'write'>;
}

const configPath = path.resolve(__dirname, '../../src/shared/auth-groups.config.json');
const permissionConfig: PermissionsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

/**
 * Read a boolean from the environment, falling back to the compiled default in
 * config.ts when the variable is unset or empty.
 *
 * The auth posture is compiled into the bundle/build, so without this a
 * prebuilt image (install.sh --pull) could not be switched between open and
 * read-only without rebuilding. Server-side only: this module is never bundled
 * into the browser client.
 */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

// Resolved lazily, not at module load: index.ts calls dotenv.config() in its
// module body, which runs AFTER this module's imports are evaluated. Reading
// the environment on each call means a value from services/server/.env is
// honoured just as a real environment variable from compose is.

/** Effective write policy when SSO is disabled. */
export const isOpenWrite = (): boolean => envBool('OPEN_WRITE', config.OPEN_WRITE);
/** Effective SSO switch. */
export const isSsoEnabled = (): boolean => envBool('ENABLE_SSO', config.ENABLE_SSO);

const accessPriority = { none: 0, read: 1, write: 2 };
export function getUserAccessLevel(userGroups: string[]): 'none' | 'read' | 'write' {
  let maxLevel: 'none' | 'read' | 'write' = 'none';
  for (const group of userGroups) {
    const level = permissionConfig.permissions[group];
    if (level && accessPriority[level] > accessPriority[maxLevel]) {
      maxLevel = level;
    }
  }
  return maxLevel;
}

export function authorize(requiredLevel: 'read' | 'write') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isSsoEnabled()) {
      // When SSO disabled:
      if (requiredLevel === 'write' && !isOpenWrite()) {
        // Deny write requests if OPEN_WRITE is false
        return res.status(403).json({ error: 'Write access denied: SSO disabled and OPEN_WRITE false' });
      }
      // Allow read requests and write requests if OPEN_WRITE is true
      return next();
    }

    // Support both the eduPerson edumember claim and the standard groups claim.
    const userGroups: string[] = req.oidc.user?.edumember_is_member_of || req.oidc.user?.groups || [];
    const userLevel = getUserAccessLevel(userGroups);

    if (accessPriority[userLevel] >= accessPriority[requiredLevel]) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied' });
    }
  };
}
