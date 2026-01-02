/**
 * Address matching utilities
 */

/**
 * Check if a potentially truncated address matches the full user address.
 * Handles both full addresses and truncated format like "bc1qab...xyz123"
 */
export function addressMatches(
  entryAddress: string,
  userAddress: string
): boolean {
  if (!entryAddress || !userAddress) return false;

  // Exact match
  if (entryAddress === userAddress) return true;

  // Check if entry address is truncated (contains "...")
  if (entryAddress.includes('...')) {
    const [prefix, suffix] = entryAddress.split('...');
    return userAddress.startsWith(prefix) && userAddress.endsWith(suffix);
  }

  return false;
}
