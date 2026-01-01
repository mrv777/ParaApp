/**
 * Formatting utilities for hashrate, temperature, time, and numbers
 */

export type TemperatureUnit = 'celsius' | 'fahrenheit';

const HASHRATE_UNITS = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];

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

  // Format to 3 significant digits
  const formatted =
    value >= 100
      ? Math.round(value).toString()
      : value >= 10
        ? value.toFixed(1)
        : value.toFixed(2);

  return `${formatted} ${HASHRATE_UNITS[unitIndex]}`;
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

  // Format to 3 significant digits
  const formatted =
    value >= 100
      ? Math.round(value).toString()
      : value >= 10
        ? value.toFixed(1)
        : value.toFixed(2);

  return `${formatted}${units[unitIndex]}`;
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
