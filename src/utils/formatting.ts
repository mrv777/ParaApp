/**
 * Formatting utilities for hashrate, temperature, time, and numbers
 */

export type TemperatureUnit = 'celsius' | 'fahrenheit';

const HASHRATE_UNITS = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];

/**
 * Format a value to 3 significant digits
 * @param value - Number to format
 * @returns Formatted string with appropriate decimal places
 */
function formatSignificantDigits(value: number): string {
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * Format hashrate with auto-scaling and 3 significant digits
 * @param hashrate - Hashrate in H/s
 * @returns Formatted string like "1.23 TH/s" or "456 GH/s"
 */
export function formatHashrate(hashrate: number): string {
  if (hashrate === 0) return '0 H/s';
  if (!Number.isFinite(hashrate)) return '-- H/s';

  let unitIndex = 0;
  let value = hashrate;

  while (value >= 1000 && unitIndex < HASHRATE_UNITS.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  return `${formatSignificantDigits(value)} ${HASHRATE_UNITS[unitIndex]}`;
}

/**
 * Format temperature with unit preference
 * @param tempCelsius - Temperature in Celsius
 * @param unit - Display unit preference
 * @returns Formatted string like "65°C" or "149°F"
 */
export function formatTemperature(
  tempCelsius: number,
  unit: TemperatureUnit = 'celsius'
): string {
  if (!Number.isFinite(tempCelsius)) return '--°';

  if (unit === 'fahrenheit') {
    const fahrenheit = (tempCelsius * 9) / 5 + 32;
    return `${Math.round(fahrenheit)}°F`;
  }

  return `${Math.round(tempCelsius)}°C`;
}

/**
 * Format uptime in compact format
 * @param seconds - Uptime in seconds
 * @returns Formatted string like "3d 4h 12m"
 */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

/**
 * Format timestamp as relative (<24h) or absolute (>24h)
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted string like "5 min ago" or "Dec 31, 14:23"
 */
export function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '--';

  const now = Date.now();
  const diff = now - timestamp;
  const diffSeconds = Math.floor(diff / 1000);

  // Within last minute
  if (diffSeconds < 60) {
    return 'Just now';
  }

  // Within last hour
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} min ago`;
  }

  // Within last 24 hours
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  }

  // More than 24 hours - show absolute
  const date = new Date(timestamp);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${month} ${day}, ${hours}:${minutes}`;
}

/**
 * Format number with locale-based separators
 * @param num - Number to format
 * @param decimals - Number of decimal places (optional)
 * @returns Formatted string with locale separators
 */
export function formatNumber(num: number, decimals?: number): string {
  if (!Number.isFinite(num)) return '--';

  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse difficulty string from AxeOS API (e.g., "24.3G", "1.05M", "500K")
 * @param diffStr - Difficulty string with optional unit suffix
 * @returns Numeric difficulty value
 */
export function parseDifficulty(diffStr: string | number | null | undefined): number {
  // Handle null, undefined, empty string, or zero
  if (diffStr == null || diffStr === '') return 0;

  // Handle numeric input (some AxeOS firmware returns number instead of string)
  if (typeof diffStr === 'number') {
    return Number.isFinite(diffStr) ? diffStr : 0;
  }

  const units: Record<string, number> = {
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  };

  // Match number with optional unit suffix (e.g., "24.3G", "1.05M", "500")
  const match = diffStr.match(/^([\d.]+)\s*([KMGTPE])?$/i);
  if (!match) return parseFloat(diffStr) || 0;

  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();

  if (!Number.isFinite(value)) return 0;

  return unit ? value * (units[unit] || 1) : value;
}

/**
 * Format difficulty with auto-scaling
 * @param diff - Difficulty value
 * @returns Formatted string like "1.23M" or "456K"
 */
export function formatDifficulty(diff: number): string {
  if (diff === 0) return '0';
  if (!Number.isFinite(diff)) return '--';

  const units = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
  let unitIndex = 0;
  let value = diff;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  return `${formatSignificantDigits(value)}${units[unitIndex]}`;
}

/**
 * Truncate Bitcoin address for display
 * @param address - Full Bitcoin address
 * @param chars - Characters to show on each end (default: 6)
 * @returns Truncated address like "bc1q...xyz123"
 */
export function truncateAddress(address: string, chars: number = 6): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;

  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Truncate a worker name (often bitcoin address + worker suffix)
 * @param worker - Full worker string (e.g., "bc1q...xyz.workername")
 * @param maxLength - Maximum length before truncating (default: 24)
 * @returns Truncated worker name preserving the worker suffix if present
 */
export function truncateWorker(worker: string, maxLength = 24): string {
  if (!worker || worker.length <= maxLength) return worker;

  // If it contains a dot (address.worker format), try to preserve worker name
  const dotIndex = worker.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < worker.length - 1) {
    const address = worker.substring(0, dotIndex);
    const workerName = worker.substring(dotIndex + 1);
    // Truncate address, keep worker name
    const truncatedAddr =
      address.length > 12
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : address;
    return `${truncatedAddr}.${workerName}`;
  }

  // Simple truncation with ellipsis
  return `${worker.slice(0, 10)}...${worker.slice(-8)}`;
}

/**
 * Format power consumption
 * @param watts - Power in watts
 * @returns Formatted string like "15.2 W"
 */
export function formatPower(watts: number): string {
  if (!Number.isFinite(watts)) return '-- W';
  return `${watts.toFixed(1)} W`;
}

/**
 * Format voltage
 * @param millivolts - Voltage in millivolts
 * @returns Formatted string like "1.20 V"
 */
export function formatVoltage(millivolts: number): string {
  if (!Number.isFinite(millivolts)) return '-- V';
  return `${(millivolts / 1000).toFixed(2)} V`;
}

/**
 * Format percentage
 * @param value - Percentage value (0-100)
 * @returns Formatted string like "85%"
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--%';
  return `${Math.round(value)}%`;
}

/**
 * Extract worker name from stratum user string
 * Format: {bitcoin_address}.{worker_name}.{device_id}@{pool_domain}
 * Example: "bc1qxxx.q43.gamma@pool.com" → "q43"
 * @param stratumUser - Full stratum user string from miner
 * @returns Worker name portion, or null if not parseable
 */
export function parseWorkerName(stratumUser: string): string | null {
  if (!stratumUser) return null;

  // Remove pool domain if present (e.g., @sati.pro)
  const withoutDomain = stratumUser.split('@')[0];

  // Split by dots: [bitcoin_address, worker_name, device_id, ...]
  const parts = withoutDomain.split('.');

  // Need at least 2 parts (address.worker)
  if (parts.length < 2) return null;

  // Worker name is the second part (after bitcoin address)
  return parts[1] || null;
}
