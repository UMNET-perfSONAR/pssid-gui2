// Which access points an SSID profile is tested on.
//
// One definition for the three places that need it: the API validates what it
// stores, assertDaemonValid re-checks what it writes into pssid_config.json,
// and the SSID profile form shows the same errors as you type. The rules are
// pssid-daemon's (pssid_daemon/config.py, Targeting); change both together.
//
//   min_signal       skip an attempt whose best access point is weaker (dBm)
//   bands            test each listed band separately (2.4, 5, 6)
//   per_bssid        test each access point heard for the SSID, strongest first,
//                    up to max_bssids
//   bssids           test these access points; an entry may be a $metadata
//                    reference, so each probe can name the AP nearest to it
//   connect_timeout  seconds to wait for the connection (the daemon's default is 30)
//
// Unset fields are left out, so a profile without them is written exactly as
// before and older daemons, which ignore them, behave as before.

export const BANDS = ['2.4', '5', '6'] as const;
export type Band = (typeof BANDS)[number];

export interface ApTargeting {
  min_signal?: number;
  bands?: Band[];
  per_bssid?: boolean;
  max_bssids?: number;
  bssids?: string[];
  connect_timeout?: number;
}

export const TARGETING_FIELDS = ['min_signal', 'bands', 'per_bssid', 'max_bssids', 'bssids', 'connect_timeout'] as const;

export const MAX_LISTED_BSSIDS = 32;

const MAC = /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i;
const REFERENCE = /^\$[A-Za-z0-9_]{1,64}$/;

const blank = (v: unknown): boolean => v === undefined || v === null || v === '';

function wholeNumber(v: unknown, low: number, high: number): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= low && n <= high ? n : null;
}

/** Splits a typed list of BSSIDs on commas, spaces and new lines. */
export function splitBssids(text: string): string[] {
  return text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Reads the targeting fields of an SSID profile as submitted (form or API).
 * Returns the fields to store, with unset ones left out, or the first error.
 */
export function parseTargeting(input: Record<string, unknown>): { value: ApTargeting; error: string | null } {
  const value: ApTargeting = {};
  const fail = (error: string) => ({ value: {}, error });

  if (!blank(input.min_signal)) {
    const n = wholeNumber(input.min_signal, -120, 0);
    if (n === null) return fail('Minimum signal must be a whole number of dBm from -120 to 0, such as -75.');
    value.min_signal = n;
  }

  if (!blank(input.bands)) {
    const listed = Array.isArray(input.bands) ? input.bands.map(String) : null;
    if (!listed || !listed.every((band) => (BANDS as readonly string[]).includes(band))) {
      return fail('Bands must be any of 2.4, 5 and 6 GHz.');
    }
    const bands = BANDS.filter((band) => listed.includes(band));
    if (bands.length) value.bands = bands;
  }

  if (!blank(input.per_bssid) && typeof input.per_bssid !== 'boolean') {
    return fail('"Each access point heard" must be on or off.');
  }
  if (input.per_bssid === true) {
    value.per_bssid = true;
    if (!blank(input.max_bssids)) {
      const n = wholeNumber(input.max_bssids, 1, 32);
      if (n === null) return fail('The number of access points to test must be from 1 to 32.');
      value.max_bssids = n;
    }
  }

  if (!blank(input.bssids)) {
    const listed = Array.isArray(input.bssids) ? input.bssids.map(String) : splitBssids(String(input.bssids));
    const bssids: string[] = [];
    for (const entry of listed.map((s) => s.trim()).filter(Boolean)) {
      if (REFERENCE.test(entry)) {
        if (!bssids.includes(entry)) bssids.push(entry);
      } else if (MAC.test(entry)) {
        const mac = entry.toLowerCase().replace(/-/g, ':');
        if (!bssids.includes(mac)) bssids.push(mac);
      } else {
        return fail(`"${entry}" is not a BSSID like 00:11:22:33:44:55 or a $metadata reference.`);
      }
    }
    if (bssids.length > MAX_LISTED_BSSIDS) return fail(`List at most ${MAX_LISTED_BSSIDS} access points.`);
    if (bssids.length && value.per_bssid) {
      return fail('Test each access point heard, or list access points, not both.');
    }
    if (bssids.length) value.bssids = bssids;
  }

  if (!blank(input.connect_timeout)) {
    const n = wholeNumber(input.connect_timeout, 1, 300);
    if (n === null) return fail('Connect timeout must be a whole number of seconds from 1 to 300.');
    value.connect_timeout = n;
  }

  return { value, error: null };
}
