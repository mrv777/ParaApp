/**
 * Network discovery utilities for AxeOS miners
 */

import NetInfo from '@react-native-community/netinfo';
import type { DiscoveryProgress, DiscoveryOptions } from '@/types';
import { extractSubnet } from './validation';

/** Timeout for discovery probes (ms) - no retries, fast fail */
const DISCOVERY_TIMEOUT = 5000;

/** Default concurrent connections */
const DEFAULT_CONCURRENCY = 50;

/**
 * Discovery callbacks for progress reporting
 */
export interface DiscoveryCallbacks {
  onProgress: (progress: DiscoveryProgress) => void;
  onFound: (ip: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

/**
 * Get current device's subnet from network info
 * @returns Subnet in format "192.168.1" or null if not on WiFi
 */
export async function getDeviceSubnet(): Promise<string | null> {
  try {
    const netInfo = await NetInfo.fetch();

    // Must be connected to WiFi
    if (netInfo.type !== 'wifi' || !netInfo.isConnected) {
      return null;
    }

    // Get IP address from details
    const details = netInfo.details as { ipAddress?: string } | null;
    if (!details?.ipAddress) {
      return null;
    }

    return extractSubnet(details.ipAddress);
  } catch {
    return null;
  }
}

/**
 * Check if a single IP responds as an AxeOS miner
 * Uses a fast single-attempt probe (no retries)
 * @param ip - IP address to check
 * @param signal - Optional abort signal
 * @returns true if an AxeOS miner responds
 */
async function probeMiner(ip: string, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);

  // Link our timeout controller with the passed signal
  const handleAbort = () => controller.abort();
  signal?.addEventListener('abort', handleAbort);

  try {
    const response = await fetch(`http://${ip}/api/system/info`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    // Validate it's actually an AxeOS miner by checking for expected fields
    const data = await response.json();
    return (
      typeof data === 'object' &&
      data !== null &&
      'ASICModel' in data &&
      'hashRate' in data
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleAbort);
  }
}

/**
 * Scan a subnet for AxeOS miners using a worker pool pattern
 *
 * @param callbacks - Progress and result callbacks
 * @param options - Discovery options (subnet, range, concurrency)
 * @returns AbortController to cancel the scan
 *
 * @example
 * ```ts
 * const controller = scanSubnet({
 *   onProgress: (p) => console.log(`${p.scanned}/${p.total}`),
 *   onFound: (ip) => console.log(`Found: ${ip}`),
 *   onComplete: () => console.log('Done'),
 *   onError: (e) => console.error(e),
 * });
 *
 * // To cancel:
 * controller.abort();
 * ```
 */
export function scanSubnet(
  callbacks: DiscoveryCallbacks,
  options: DiscoveryOptions = {}
): AbortController {
  const controller = new AbortController();
  const {
    concurrency = DEFAULT_CONCURRENCY,
    subnet: providedSubnet,
    startIp = 1,
    endIp = 254,
  } = options;

  // Start the async scan
  (async () => {
    try {
      // Get subnet (auto-detect or use provided)
      const targetSubnet = providedSubnet ?? (await getDeviceSubnet());

      if (!targetSubnet) {
        callbacks.onError('Connect to WiFi to discover miners');
        return;
      }

      // Build IP list to scan
      const ips: string[] = [];
      for (let i = startIp; i <= endIp; i++) {
        ips.push(`${targetSubnet}.${i}`);
      }

      const total = ips.length;
      let scanned = 0;
      let found = 0;
      let index = 0;

      // Initial progress
      callbacks.onProgress({ scanned: 0, total, found: 0 });

      // Worker function - pulls IPs from the queue
      const worker = async () => {
        while (!controller.signal.aborted) {
          // Get next IP (atomic operation)
          const currentIndex = index++;
          if (currentIndex >= ips.length) {
            break;
          }

          const ip = ips[currentIndex];

          try {
            const isMiner = await probeMiner(ip, controller.signal);

            if (controller.signal.aborted) {
              break;
            }

            if (isMiner) {
              found++;
              callbacks.onFound(ip);
            }
          } catch {
            // Ignore individual probe errors
          }

          scanned++;
          callbacks.onProgress({ scanned, total, found });
        }
      };

      // Start concurrent workers
      const workerCount = Math.min(concurrency, total);
      const workers = Array.from({ length: workerCount }, () => worker());

      await Promise.all(workers);

      if (!controller.signal.aborted) {
        callbacks.onComplete();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        callbacks.onError(
          error instanceof Error ? error.message : 'Discovery failed'
        );
      }
    }
  })();

  return controller;
}
