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
  const parseVersion = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map(Number);

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
  // Guard against missing data
  if (!miner.version || !miner.deviceModel) {
    return false;
  }

  // NerdQAxe++ and other forks don't support identify
  if (miner.deviceModel.toLowerCase().includes('nerd')) {
    return false;
  }

  // Requires ESP-Miner v2.12.0+
  return compareVersions(miner.version, IDENTIFY_MIN_VERSION) >= 0;
}
