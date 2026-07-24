/**
 * Version comparison utilities for firmware compatibility checks
 */

import type { LocalMiner } from '@/types';

/**
 * Compare two semantic version strings
 * @param a - First version (e.g., "v2.9.0" or "2.9.0")
 * @param b - Second version
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  // Strip leading "v" and trailing date suffix (e.g., "2.0.0 20260309")
  const parseVersion = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map(part => Number(part.replace(/\s.*$/, '')));

  const partsA = parseVersion(a);
  const partsB = parseVersion(b);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/** Minimum version for identify feature (ESP-Miner v2.12.0, Dec 2025) */
const IDENTIFY_MIN_VERSION = 'v2.12.0';

/**
 * Check if a miner supports the identify feature
 * Requires ESP-Miner v2.12.0+ and not a fork (NerdQAxe++, etc.)
 */
export function supportsIdentify(miner: LocalMiner): boolean {
  // LuxOS supports identify via `ledset` (red LED blink). Must be
  // decided before the ESP-Miner semver parsing below — LuxOS version
  // strings (e.g. "2024.2.19.131822-ef17c0c4") aren't semver.
  if (miner.minerType === 'luxos') {
    return true;
  }

  // Guard against missing data
  if (!miner.version || !miner.deviceModel) {
    return false;
  }

  // Hammer: v3 firmware (`/v2/*`) can flash its RGB LED; legacy 2.x can't.
  if (miner.minerType === 'hammer') {
    return miner.hammerApiVersion === 2;
  }

  // Avalon Q firmware has no LED-identify equivalent (no `led` option in
  // ascset help on MM319). Other Canaan models may differ; revisit
  // if/when we test on a Nano or Mini.
  if (miner.minerType === 'avalon') {
    return false;
  }

  // KBox API v1 has no identify endpoint (and we don't emulate one
  // with the ambient LEDs). Also gated by its empty version string,
  // but keep this explicit.
  if (miner.minerType === 'kbox') {
    return false;
  }

  // NerdQAxe++ and other forks don't support identify
  if (miner.deviceModel.toLowerCase().includes('nerd')) {
    return false;
  }

  // Requires ESP-Miner v2.12.0+
  return compareVersions(miner.version, IDENTIFY_MIN_VERSION) >= 0;
}
