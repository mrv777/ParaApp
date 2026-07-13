/**
 * Return the canonical text form used for Bitcoin-address identity keys.
 *
 * Bech32/Bech32m permits an all-uppercase representation, but pool and app
 * databases conventionally key addresses by their lowercase form. Base58 is
 * case-sensitive and must be preserved exactly. Mixed-case Bech32 is invalid,
 * so only the valid uppercase prefix is normalized here.
 */
export function normalizeBitcoinAddress(address: string): string {
  return address.startsWith('BC1') ? address.toLowerCase() : address;
}
