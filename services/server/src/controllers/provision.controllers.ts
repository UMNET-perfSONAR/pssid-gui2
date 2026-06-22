import { Request, Response } from 'express';
import { build_config_payload, get_current_config } from '../services/config.service';

/**
 * GET /api/provision/preview — dry run.
 * Returns the config + inventory that WOULD be deployed from the current DB
 * state, the currently-deployed versions, and whether they differ. Does not
 * write anything or run the provision script.
 */
const getProvisionPreview = async (_req: Request, res: Response) => {
  try {
    const proposed = await build_config_payload();
    const current = get_current_config();
    const changed =
      (current.config ?? '') !== proposed.config ||
      (current.inventory ?? '') !== proposed.inventory;
    res.json({ proposed, current, changed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to build config preview' });
  }
};

module.exports = { getProvisionPreview };
