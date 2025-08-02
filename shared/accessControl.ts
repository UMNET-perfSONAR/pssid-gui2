import fs from 'fs';
import path from 'path';
import config from './config';
import { Request, Response, NextFunction } from 'express';

interface PermissionsConfig {
  permissions: Record<string, 'none' | 'read' | 'write'>;
}

const configPath = path.resolve(__dirname, '../../src/shared/auth-groups.config.json');
const permissionConfig: PermissionsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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
    if (!config.ENABLE_SSO) {
      // When SSO disabled:
      if (requiredLevel === 'write' && !config.OPEN_WRITE) {
        // Deny write requests if OPEN_WRITE is false
        return res.status(403).json({ error: 'Write access denied: SSO disabled and OPEN_WRITE false' });
      }
      // Allow read requests and write requests if OPEN_WRITE is true
      return next();
    }

    const userGroups = req.oidc.user?.edumember_is_member_of || [];
    const userLevel = getUserAccessLevel(userGroups);

    if (accessPriority[userLevel] >= accessPriority[requiredLevel]) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied' });
    }
  };
}
