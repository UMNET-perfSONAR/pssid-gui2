import { Request, Response } from 'express';
import { getSettings, updateSettings } from '../services/settings.service';

/** GET /api/settings, current application settings. */
const getAppSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/** PUT /api/settings, update settings (write-guarded by the router). */
const putAppSettings = async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.autoProvision !== 'undefined' &&
        typeof req.body.autoProvision !== 'boolean') {
      return res.status(400).json({ message: 'autoProvision must be a boolean' });
    }
    const updated = await updateSettings({ autoProvision: req.body?.autoProvision });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getAppSettings, putAppSettings };
