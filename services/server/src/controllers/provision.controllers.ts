import { Request, Response } from 'express';
import { build_config_payload } from '../services/config.service';

/**
 * GET /api/provision/preview, dry run.
 * Returns the config + inventory that would be generated from the current DB
 * state. Does not write anything to disk or run the provision script.
 *
 * This intentionally does NOT compare against whatever was last written to
 * disk ("currently deployed"): the GUI has no provisioning entry points left
 * (see [[provisioning-stub-removed]]) and therefore no way to keep that
 * baseline meaningful, and no way to know whether any file ever reached a
 * real probe regardless. The one thing this endpoint can honestly guarantee
 * is whether the config generated from the CURRENT database state is
 * well-formed - so a validation failure (assertDaemonValid, inside
 * build_config_payload) is reported as a real 422 with the specific problem,
 * the same way getHostConfig already does, instead of a generic 500.
 */
const getProvisionPreview = async (req: Request, res: Response) => {
  try {
    const oidcUser = (req as any).oidc?.user;
    const caller: string = oidcUser?.sub || oidcUser?.email || 'unauthenticated';
    const caller_role: string = oidcUser ? 'authenticated' : 'unauthenticated';
    const proposed = await build_config_payload({ caller, caller_role });
    res.json({ proposed });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Config validation failed')) {
      return res.status(422).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: 'Failed to build config preview' });
  }
};

module.exports = { getProvisionPreview };
