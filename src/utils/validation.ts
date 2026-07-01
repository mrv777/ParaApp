/**
 * Validation utilities for Bitcoin addresses and IP addresses
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

// Required for taproot (bc1p...) validation — bitcoinjs-lib verifies the
// x-only pubkey against the secp256k1 curve.
bitcoin.initEccLib(ecc);

/**
 * Validate a Bitcoin address using bitcoinjs-lib
 * Supports: Legacy (1...), SegWit (3...), Native SegWit (bc1q...), Taproot (bc1p...)
 * @param addr - Bitcoin address to validate
 * @returns true if valid, false otherwise
 */
export function isValidBitcoinAddress(addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false;

  try {
    bitcoin.address.toOutputScript(addr, bitcoin.networks.bitcoin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether an address is a taproot (P2TR / bc1p...) address.
 * Assumes the input has already been validated.
 */
export function isTaprootAddress(addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false;
  return addr.toLowerCase().startsWith('bc1p');
}

/**
 * Validate an IPv4 address
 * @param ip - IP address to validate
 * @returns true if valid IPv4 address, false otherwise
 */
export function isValidIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;

  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  return ipv4Regex.test(ip);
}

/**
 * Validate a stratum URL format
 * @param url - Stratum URL (e.g., "stratum+tcp://pool.example.com")
 * @returns true if valid format, false otherwise
 */
export function isValidStratumUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  // Common stratum URL patterns
  const stratumRegex = /^stratum\+tcp:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;
  const simpleHostRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;

  return stratumRegex.test(url) || simpleHostRegex.test(url);
}

/**
 * Validate an Avalon pool URL: `stratum+tcp://host[:port]`.
 * Port is optional; if present it must be 1-65535. Avalon stores and
 * expects the full scheme+host+port form (see CANAAN_AVALON_API.md), so
 * this is kept separate from `isValidStratumUrl` (which validates a
 * host-only field for AxeOS/Hammer).
 * @param url - Avalon pool URL
 * @returns true if valid, false otherwise
 */
export function isValidAvalonPoolUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  const m = url.match(
    /^stratum\+tcp:\/\/([a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]|[a-zA-Z0-9])(?::(\d{1,5}))?$/
  );
  if (!m) return false;

  if (m[2] !== undefined) {
    const port = Number(m[2]);
    if (port < 1 || port > 65535) return false;
  }

  return true;
}

/**
 * Validate port number
 * @param port - Port number
 * @returns true if valid port (1-65535), false otherwise
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Extract subnet from IP address (for miner discovery)
 * @param ip - IP address
 * @returns Subnet in format "192.168.1" or null if invalid
 */
export function extractSubnet(ip: string): string | null {
  if (!isValidIpAddress(ip)) return null;

  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/**
 * Parse IP range string into components for discovery
 * Supports formats:
 * - "192.168.1.1-100" (same subnet shorthand)
 * - "192.168.1.1 - 192.168.1.100" (full range)
 * - "192.168.1.50-192.168.1.150" (no spaces)
 * @param rangeStr - IP range string
 * @returns Parsed range object or null if invalid
 */
export function parseIpRange(rangeStr: string): {
  subnet: string;
  start: number;
  end: number;
} | null {
  if (!rangeStr || typeof rangeStr !== 'string') return null;

  // Normalize: remove extra spaces, trim
  const normalized = rangeStr.replace(/\s+/g, '').trim();

  // Check for shorthand format: "192.168.1.1-100"
  const shorthandMatch = normalized.match(
    /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})-(\d{1,3})$/
  );
  if (shorthandMatch) {
    const subnet = shorthandMatch[1];
    const start = parseInt(shorthandMatch[2], 10);
    const end = parseInt(shorthandMatch[3], 10);

    // Validate subnet parts
    const subnetParts = subnet.split('.').map(Number);
    if (subnetParts.some((p) => p < 0 || p > 255)) return null;

    // Validate range
    if (start < 1 || start > 254 || end < 1 || end > 254) return null;
    if (start > end) return null;

    return { subnet, start, end };
  }

  // Check for full format: "192.168.1.1-192.168.1.100"
  const fullMatch = normalized.match(
    /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})-(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/
  );
  if (fullMatch) {
    const subnet1 = fullMatch[1];
    const start = parseInt(fullMatch[2], 10);
    const subnet2 = fullMatch[3];
    const end = parseInt(fullMatch[4], 10);

    // Subnets must match
    if (subnet1 !== subnet2) return null;

    // Validate subnet parts
    const subnetParts = subnet1.split('.').map(Number);
    if (subnetParts.some((p) => p < 0 || p > 255)) return null;

    // Validate range
    if (start < 1 || start > 254 || end < 1 || end > 254) return null;
    if (start > end) return null;

    return { subnet: subnet1, start, end };
  }

  return null;
}
