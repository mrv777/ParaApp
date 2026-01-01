/**
 * Local Bitaxe miner data types
 */

/**
 * Miner warning types
 */
export type MinerWarningType =
  | 'temp_caution'
  | 'temp_danger'
  | 'overheat'
  | 'power_fault'
  | 'low_hashrate'
  | 'offline';

/**
 * Warning severity levels
 */
export type WarningSeverity = 'caution' | 'danger';

/**
 * Sort options for miners list
 */
export type MinerSortOption = 'name' | 'hashrate' | 'temp' | 'status';

/**
 * Filter options for miners list
 */
export type MinerFilterOption = 'all' | 'online' | 'offline' | 'warning';

/**
 * Miner warning state
 */
export interface MinerWarning {
  type: MinerWarningType;
  severity: WarningSeverity;
  message?: string;
}

/**
 * Local Bitaxe miner device
 */
export interface LocalMiner {
  /** IP address of the miner */
  ip: string;
  /** User-defined alias */
  alias?: string;
  /** Device hostname */
  hostname: string;
  /** ASIC model (e.g., "BM1370") */
  ASICModel: string;
  /** Device model (e.g., "Gamma", "Ultra", "Supra") */
  deviceModel: string;
  /** Expected hashrate based on model (GH/s) */
  expectedHashrate: number;
  /** Current hashrate (GH/s) */
  hashRate: number;
  /** Power consumption (W) */
  power: number;
  /** Temperature (Celsius) */
  temp: number;
  /** Core voltage (mV) */
  voltage: number;
  /** Fan speed (%) */
  fanSpeed: number;
  /** Best difficulty ever achieved */
  bestDiff: number;
  /** Best difficulty this session (since restart) */
  bestSessionDiff: number;
  sharesAccepted: number;
  sharesRejected: number;
  /** Stratum user (worker name) */
  stratumUser: string;
  /** Pool stratum URL */
  stratumUrl: string;
  /** Pool stratum port */
  stratumPort: number;
  /** Firmware version */
  version: string;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Connected WiFi network */
  wifiSSID?: string;
  /** WiFi signal strength */
  rssi?: number;
  /** Overheat protection active */
  overheatMode?: boolean;
  /** Power fault detected */
  powerFault?: boolean;
  /** Last seen timestamp */
  lastSeen: number;
  /** Current online status */
  isOnline: boolean;
}

/**
 * Miner settings that can be modified
 */
export interface MinerSettings {
  /** Core frequency (MHz) */
  frequency?: number;
  /** Core voltage (mV) */
  coreVoltage?: number;
  /** Fan speed (%) - 0 for auto */
  fanSpeed?: number;
  /** Pool stratum URL */
  stratumUrl?: string;
  /** Pool stratum port */
  stratumPort?: number;
  /** Stratum user/worker name */
  stratumUser?: string;
  /** Stratum password */
  stratumPassword?: string;
}

/**
 * Bitaxe system info response from /api/system/info
 */
export interface BitaxeSystemInfo {
  power: number;
  voltage: number;
  current: number;
  temp: number;
  vrTemp: number;
  hashRate: number;
  bestDiff: string;
  bestSessionDiff: string;
  freeHeap: number;
  coreVoltage: number;
  coreVoltageActual: number;
  frequency: number;
  ssid: string;
  wifiStatus: string;
  sharesAccepted: number;
  sharesRejected: number;
  uptimeSeconds: number;
  ASICModel: string;
  stratumURL: string;
  stratumPort: number;
  stratumUser: string;
  hostname: string;
  version: string;
  boardVersion: string;
  runningPartition: string;
  flipscreen: number;
  overheat_mode: number;
  invertscreen: number;
  invertfanpolarity: number;
  autofanspeed: number;
  fanspeed: number;
  fanrpm: number;
}

/**
 * Saved miner data for persistence (minimal)
 */
export interface SavedMiner {
  ip: string;
  alias?: string;
  /** Last known best diff (shown when offline) */
  lastBestDiff?: number;
}

/**
 * Discovery progress state
 */
export interface DiscoveryProgress {
  /** Number of IPs scanned so far */
  scanned: number;
  /** Total number of IPs to scan */
  total: number;
  /** Number of miners found */
  found: number;
}

/**
 * Discovery options for subnet scanning
 */
export interface DiscoveryOptions {
  /** Override auto-detected subnet (e.g., "192.168.1") */
  subnet?: string;
  /** Start of IP range (1-254), default: 1 */
  startIp?: number;
  /** End of IP range (1-254), default: 254 */
  endIp?: number;
  /** Concurrent connections, default: 50 */
  concurrency?: number;
}
