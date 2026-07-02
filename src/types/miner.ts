/**
 * Local miner data types
 */

/**
 * Miner firmware type
 */
export type MinerType = 'axeos' | 'hammer' | 'avalon' | 'unknown';

/**
 * Avalon working mode — exposed as preset performance profiles instead of
 * frequency/voltage sliders like AxeOS.
 *  - 0 = Eco (lowest power)
 *  - 1 = Standard
 *  - 2 = Super (highest hashrate, highest power)
 */
export type AvalonWorkMode = 0 | 1 | 2;

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
export type MinerSortOption = 'name' | 'hashrate' | 'temp' | 'status' | 'bestDiff';

/**
 * Filter options for miners list
 */
export type MinerFilterOption = 'all' | 'online' | 'offline' | 'warning';

/**
 * View layout for the miners list — compact rows or fuller stat cards
 */
export type MinerViewMode = 'list' | 'card';

/**
 * Miner warning state
 */
export interface MinerWarning {
  type: MinerWarningType;
  severity: WarningSeverity;
  message?: string;
}

/**
 * Local miner device
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
  /** Device model (e.g., "Gamma", "Ultra", "Hammer BC04") */
  deviceModel: string;
  /** Detected miner firmware type */
  minerType: MinerType;
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
  /** Core frequency (MHz) */
  frequency: number;
  /** Fan speed (%) */
  fanSpeed: number;
  /** Auto fan mode value — 0 = manual, >0 = auto (firmware may support multiple auto modes) */
  autoFanSpeed: number;
  /** Auto-fan target temperature (°C). Undefined when firmware doesn't expose it. */
  targetTemp?: number;
  /** Fan RPM reading */
  fanRpm: number;
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
  /** WiFi signal strength (dBm) */
  rssi?: number;
  /** Overheat protection active */
  overheatMode?: boolean;
  /** Power fault detected */
  powerFault?: boolean;
  /** Last seen timestamp */
  lastSeen: number;
  /** Current online status */
  isOnline: boolean;
  // Hammer-specific fields
  /** Hardware error count (Hammer) */
  hwErrors?: number;
  /** Hardware error rate % (Hammer) */
  hwErrorRate?: number;
  /** Fallback stratum URL (Hammer) */
  fallbackStratumUrl?: string;
  /** Fallback stratum port (Hammer) */
  fallbackStratumPort?: number;
  /** Fallback stratum user (Hammer) */
  fallbackStratumUser?: string;
  /** Whether fallback stratum is active (Hammer) */
  isUsingFallbackStratum?: boolean;
  /** Serial number (Hammer) */
  serialNumber?: string;
  /** Boot mode — 0=normal, 1=overclock, 2=custom (Hammer) */
  bootMode?: number;
  /** Raw device config fields needed for Hammer full-payload PATCH */
  rawConfig?: {
    flipscreen: number;
    invertfanpolarity: number;
    overheat_mode: number;
    ntpServer: string;
    ntpServerBackup: string;
  };
  // Avalon-specific fields
  /** Working mode (Avalon: 0=Eco, 1=Standard, 2=Super) */
  workMode?: AvalonWorkMode;
  /** Working level — sub-step within mode, semantics vary per model (Avalon) */
  workLevel?: number;
  /** Avalon run-state is Idle/standby (soft-off). Undefined for non-Avalon / actively hashing. */
  isStandby?: boolean;
  /** Instantaneous hashrate GH/s (Avalon GHSspd); 0 in standby. Undefined for non-Avalon. */
  realtimeHashrate?: number;
  /** Hashboard inlet temperature (Avalon HBITemp) */
  hashboardInletTemp?: number;
  /** Hashboard outlet temperature (Avalon HBOTemp) */
  hashboardOutletTemp?: number;
  /** Per-fan RPM readings (Avalon has 4 fans; AxeOS has 1) */
  fanRpms?: number[];
  /** Per-ASIC inlet temperatures (Avalon estats PVT_T0; ~160 entries on the Q) */
  asicTemps?: number[];
  /** Per-ASIC voltages in mV (Avalon estats PVT_V0) */
  asicVoltages?: number[];
  /** Total ASIC count reported by miner (Avalon TA — 160 on the Q) */
  asicCount?: number;
  /** Hardware MAC address (used to disambiguate same-IP miners across DHCP changes) */
  macAddress?: string;
  /** Pool latency in ms (Avalon PING) */
  poolPing?: number;
  /** Best share difficulty across all time (Avalon Best Share) */
  bestShareDifficulty?: number;
}

/**
 * Miner settings that can be modified
 */
export interface MinerSettings {
  /** Core frequency (MHz) */
  frequency?: number;
  /** Core voltage (mV) */
  coreVoltage?: number;
  /** Fan speed (%) for manual mode */
  fanSpeed?: number;
  /** Auto fan mode value — 0 = manual, >0 = auto */
  autoFanSpeed?: number;
  /** Auto-fan target temperature (°C, 20-100) */
  targetTemp?: number;
  /** Pool stratum URL */
  stratumUrl?: string;
  /** Pool stratum port */
  stratumPort?: number;
  /** Stratum user/worker name */
  stratumUser?: string;
  /** Stratum password */
  stratumPassword?: string;
  /** Fallback stratum URL (Hammer) */
  fallbackStratumUrl?: string;
  /** Fallback stratum port (Hammer) */
  fallbackStratumPort?: number;
  /** Fallback stratum user (Hammer) */
  fallbackStratumUser?: string;
  /** Working mode (Avalon: 0=Eco, 1=Standard, 2=Super) */
  workMode?: AvalonWorkMode;
}

/**
 * The Avalon firmware exposes its full ascset vocabulary via
 * `ascset|0,help` as a pipe-delimited string of option names.
 *
 * We capture the parsed list as the source of truth for what writes
 * are possible on this specific firmware build, plus boolean
 * shortcuts for the options the app actually drives. Option names
 * that contain hyphens (e.g. `fan-spd`) are preserved verbatim.
 *
 * On Avalon Q MM319 the list is:
 *   help,voltage,fan-spd,lcd,hash-sn-read,hash-sn-write,volt-tuning,
 *   workmode,worklevel,work_mode_lvl,reboot,softon,softoff,
 *   filter-clean,facopts,faclock,activate,solo-allowed,frequency,
 *   loop,password,qr_auth,time
 *
 * `setpool` is notably absent — pool config must go through the web
 * CGI on this firmware.
 */
export interface AvalonWriteCapabilities {
  /** All option names returned by `ascset|0,help` */
  allOptions: string[];
  /** Shortcut: reboot supported (always true on Q) */
  reboot: boolean;
  /** Shortcut: workmode change supported via cgminer */
  workmode: boolean;
  /** Shortcut: pool config via cgminer (false on Q — use web CGI) */
  setpool: boolean;
  /** Shortcut: LCD on/off toggle */
  lcd: boolean;
  /** Shortcut: soft on/off (standby control) */
  softPower: boolean;
}

/**
 * AxeOS system info response from /api/system/info
 */
export interface AxeOSSystemInfo {
  power: number;
  voltage: number;
  current: number;
  temp: number;
  /** VR temperature (AxeOS only) */
  vrTemp?: number;
  hashRate: number;
  bestDiff: string | number;
  bestSessionDiff: string | number;
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
  /** Device model name — lowercase d (AxeOS: "NerdQAxe++", "Gamma") */
  deviceModel?: string;
  /** Device model name — uppercase D (Hammer: "BC04") */
  DeviceModel?: string;
  stratumURL: string;
  stratumPort: number;
  stratumUser: string;
  hostname: string;
  version: string;
  boardVersion: string;
  runningPartition: string;
  flipscreen: number;
  overheat_mode: number;
  invertscreen?: number;
  invertfanpolarity: number;
  autofanspeed: number;
  fanspeed: number;
  fanrpm: number;
  /** Target temperature for auto-fan curve (°C). Optional — older firmware omits it. */
  temptarget?: number;
  /** Number of ASIC chips (multi-chip miners like Hex have 6) */
  asicCount?: number;
  // Hammer-specific fields
  /** WiFi signal strength in dBm (Hammer) */
  wifiRSSI?: number;
  /** Small core count (Hammer) */
  smallCoreCount?: number;
  /** Serial number (Hammer) */
  sn_str?: string;
  /** Nonce count (Hammer) */
  nonceNumber?: number;
  /** Hardware error count (Hammer) */
  hwNumber?: number;
  /** Hardware error rate (Hammer) */
  hwRate?: number;
  /** WWW firmware version (Hammer) */
  WWWVersion?: string;
  /** IDF version (Hammer) */
  idfVersion?: string;
  /** MAC address (Hammer) */
  macAddr?: string;
  /** Fallback stratum URL (Hammer) */
  fallbackStratumURL?: string;
  /** Fallback stratum port (Hammer) */
  fallbackStratumPort?: number;
  /** Fallback stratum user (Hammer) */
  fallbackStratumUser?: string;
  /** Is using fallback stratum (Hammer) */
  isUsingFallbackStratum?: number;
  /** Stratum difficulty (Hammer) */
  stratumDiff?: number;
  /** Max power draw in W (Hammer) */
  maxPower?: number;
  /** Nominal voltage in V (Hammer) */
  nominalVoltage?: number;
  /** Boot mode (Hammer) */
  boot_mode?: number;
  /** Display flash mode (Hammer) */
  displayFlash?: boolean;
  /** Current time from device (Hammer) */
  currentTime?: string;
  /** AP mode enabled (Hammer) */
  apEnabled?: number;
  /** NTP server (Hammer) */
  ntpServer?: string;
  /** Backup NTP server (Hammer) */
  ntpServerBackup?: string;
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
  /** Concurrent connections, default: 30 */
  concurrency?: number;
}

/**
 * ASIC configuration from /api/system/asic
 * Provides available options for hardware settings
 */
export interface AsicConfig {
  /** ASIC model (e.g., "BM1370") */
  ASICModel: string;
  /** Device model (e.g., "NerdQAxe++") */
  deviceModel: string;
  /** Number of ASIC chips */
  asicCount?: number;
  /** Available frequency options (MHz) */
  frequencyOptions: number[];
  /** Available voltage options (mV) */
  voltageOptions: number[];
  /** Default frequency (MHz) */
  defaultFrequency: number;
  /** Default voltage (mV) */
  defaultVoltage: number;
  /** Absolute maximum frequency (MHz) */
  absMaxFrequency: number;
  /** Absolute maximum voltage (mV) */
  absMaxVoltage: number;
}
