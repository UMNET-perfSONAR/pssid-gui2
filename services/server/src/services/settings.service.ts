// Application settings persisted as a single document in the `settings`
// collection. Kept in MongoDB (not shared/config.ts) so operators can change
// behaviour at runtime through the GUI without a redeploy.
import { connectToMongoDB } from './database.service';

export interface AppSettings {
  /** When true, daemon-affecting edits auto-trigger provisioning to the probes. */
  autoProvision: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoProvision: false,
};

// All settings live in one document, keyed for easy upsert.
const SETTINGS_KEY = 'global';

/** Returns the current settings, falling back to safe defaults. */
export async function getSettings(): Promise<AppSettings> {
  try {
    const client = await connectToMongoDB();
    const doc = await client
      .db('gui')
      .collection('settings')
      .findOne({ key: SETTINGS_KEY }, { projection: { _id: 0, key: 0 } });
    return { ...DEFAULT_SETTINGS, ...(doc ?? {}) } as AppSettings;
  } catch (err) {
    console.error('Failed to read settings, using defaults:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Merge-updates settings. Only known, validated fields are written so a client
 * cannot inject arbitrary keys.
 */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const update: Partial<AppSettings> = {};
  if (typeof patch.autoProvision === 'boolean') {
    update.autoProvision = patch.autoProvision;
  }

  // Nothing valid to change — avoid an empty $set (which Mongo rejects) and
  // just return the current settings.
  if (Object.keys(update).length === 0) {
    return getSettings();
  }

  const client = await connectToMongoDB();
  await client
    .db('gui')
    .collection('settings')
    .updateOne({ key: SETTINGS_KEY }, { $set: update }, { upsert: true });

  return getSettings();
}
