import { Request, Response } from 'express';
import { build_config_payload, get_current_config, stripConfigMetadata } from '../services/config.service';

/**
 * GET /api/provision/preview, dry run.
 * Returns the config + inventory that WOULD be deployed from the current DB
 * state, the currently-deployed versions, and whether they differ. Does not
 * write anything or run the provision script.
 */
const getProvisionPreview = async (req: Request, res: Response) => {
  try {
    const oidcUser = (req as any).oidc?.user;
    const caller: string = oidcUser?.sub || oidcUser?.email || 'unauthenticated';
    const caller_role: string = oidcUser ? 'authenticated' : 'unauthenticated';
    const proposed = await build_config_payload({ caller, caller_role });
    const current = get_current_config();
    // Compare with pssid_metadata stripped: generated_at changes on every build,
    // so a raw compare would always report "changed". Provenance is not a config
    // change; only the array collections + inventory are.
    const changed =
      stripConfigMetadata(current.config) !== stripConfigMetadata(proposed.config) ||
      (current.inventory ?? '') !== proposed.inventory;
    res.json({ proposed, current, changed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to build config preview' });
  }
};

module.exports = { getProvisionPreview };
