/**
 * Validation utilities for Bitcoin addresses and IP addresses
 */

import * as bitcoin from 'bitcoinjs-lib';

/**
 * Validate a Bitcoin address using bitcoinjs-lib
 * Supports: Legacy (1...), SegWit (3...), Native SegWit (bc1q...), Taproot (bc1p...)
 * @param addr - Bitcoin address to validate
 * @returns true if valid, false otherwise
 */
export function isValidBitcoinAddress(addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false;

  try {
    // Try mainnet first
    bitcoin.address.toOutputScript(addr, bitcoin.networks.bitcoin);
    return true;
  } catch {
    // Not a valid mainnet address
    return false;
  }
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
 * Validate an IP address with optional port
 * @param ipWithPort - IP address with optional port (e.g., "192.168.1.1" or "192.168.1.1:3333")
 * @returns true if valid, false otherwise
 */
export function isValidIpWithPort(ipWithPort: string): boolean {
  if (!ipWithPort || typeof ipWithPort !== 'string') return false;

  const parts = ipWithPort.split(':');
  if (parts.length > 2) return false;

  const ip = parts[0];
  if (!isValidIpAddress(ip)) return false;

  if (parts.length === 2) {
    const port = parseInt(parts[1], 10);
    if (isNaN(port) || port < 1 || port > 65535) return false;
  }

  return true;
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
