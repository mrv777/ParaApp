import { afterEach, describe, expect, it, vi } from 'vitest';

import { adaptToLocalMiner, updateConfig, type HammerV2Snapshot } from '../hammer';
import type {
  HammerV2DeviceInfo,
  HammerV2DeviceStatus,
  HammerV2MinerStatus,
  HammerV2NetworkConfig,
} from '@/types';

afterEach(() => {
  vi.restoreAllMocks();
});

const DEVICE_INFO: HammerV2DeviceInfo = {
  device_model: 'BC04',
  hardware_version: 'v1.2.0',
  firmware_version: '3.0.0 20260718',
  mac_address: 'E0:72:A1:A1:2F:58',
  serial_number: 'ALBC04E072A1A12F58',
  chip_type: 'BM1370',
  detected_chips_count: 4,
};

const DEVICE_STATUS: HammerV2DeviceStatus = {
  uptime_seconds: 114953,
  free_heap_bytes: 6662744,
  cpu_temp: 45,
  wifi_rssi: -52,
  wifi_ssid: 'Verizon_N9HR6G',
  network_connected: true,
  ip_address: '192.168.1.152',
};

const MINER_STATUS: HammerV2MinerStatus = {
  current_hashrate: 6947516492353.32,
  fan_speed_rpm: 1756,
  temp_board: 49.625,
  temp_vcore: 63.5,
  power_consumption: 107.39801025390625,
  frequency: 800,
  boot_mode: 2,
  coreVoltage: 490,
  fan_mode: 0,
  fan_target_speed: 91,
  shares_accepted: 30661,
  shares_rejected: 31,
  bestDiff: 98777690,
  bestSessionDiff: 98777690,
  overheat_mode: 0,
  isUsingFallbackStratum: false,
  hwNumber: 4,
  hwRate: 0.0011672254758632362,
  pool_url: 'parasite.wtf',
  pool_worker: 'bc1qzf7m45343jlwtp4h42y6kzfxyvet679yalc3kc.RedPanda',
  pool_port: 42069,
  fallback_pool_url: 'btc.zsolo.bid',
  fallback_pool_worker: 'LX1ysSCebjGSVPgf8Wqg2Tg9Ya1oRhHWsz',
  fallback_pool_port: 6060,
  chips: [
    { chip_id: 0, domain_id: 0, temperature: 57.8, hashrate: 1571, hardware_errors: 5485, status: 'active' },
    { chip_id: 1, domain_id: 1, temperature: 58.3, hashrate: 1664, hardware_errors: 16092, status: 'active' },
    { chip_id: 2, domain_id: 2, temperature: 58.8, hashrate: 1619, hardware_errors: 6591, status: 'active' },
    { chip_id: 3, domain_id: 3, temperature: 57.8, hashrate: 1680, hardware_errors: 3191, status: 'active' },
  ],
};

const NETWORK_CONFIG: HammerV2NetworkConfig = {
  ip_address: '192.168.1.152',
  hostname: 'THOR',
  wifi_ssid: 'Verizon_N9HR6G',
  wifi_rssi: -52,
};

const FULL_SNAPSHOT: HammerV2Snapshot = {
  minerStatus: MINER_STATUS,
  deviceInfo: DEVICE_INFO,
  deviceStatus: DEVICE_STATUS,
  networkConfig: NETWORK_CONFIG,
};

describe('hammer adaptToLocalMiner', () => {
  it('maps a full v2 snapshot into a LocalMiner', () => {
    const m = adaptToLocalMiner({ ip: '192.168.1.152', snapshot: FULL_SNAPSHOT });

    expect(m.ip).toBe('192.168.1.152');
    expect(m.minerType).toBe('hammer');
    expect(m.hammerApiVersion).toBe(2);
    expect(m.deviceModel).toBe('Hammer BC04');
    expect(m.ASICModel).toBe('BM1370');
    expect(m.hostname).toBe('THOR');
    expect(m.version).toBe('3.0.0 20260718');
    expect(m.serialNumber).toBe('ALBC04E072A1A12F58');
    expect(m.macAddress).toBe('E0:72:A1:A1:2F:58');
    // H/s → GH/s
    expect(m.hashRate).toBeCloseTo(6947.5164923, 3);
    expect(m.temp).toBe(49.625);
    expect(m.voltage).toBe(490);
    expect(m.frequency).toBe(800);
    expect(m.fanRpm).toBe(1756);
    expect(m.bestDiff).toBe(98777690);
    expect(m.sharesAccepted).toBe(30661);
    expect(m.sharesRejected).toBe(31);
    expect(m.stratumUrl).toBe('parasite.wtf');
    expect(m.stratumPort).toBe(42069);
    expect(m.fallbackStratumUrl).toBe('btc.zsolo.bid');
    expect(m.isUsingFallbackStratum).toBe(false);
    expect(m.uptimeSeconds).toBe(114953);
    expect(m.wifiSSID).toBe('Verizon_N9HR6G');
    expect(m.rssi).toBe(-52);
    // Per-chip temps feed the heatmap
    expect(m.asicCount).toBe(4);
    expect(m.asicTemps).toEqual([57.8, 58.3, 58.8, 57.8]);
    // expected hashrate = per-chip (BM1370 = 1200) × 4 chips
    expect(m.expectedHashrate).toBe(4800);
    // v2 has no auto-fan temp target
    expect(m.targetTemp).toBeUndefined();
    expect(m.isOnline).toBe(true);
  });

  it('degrades gracefully when only miner/status is available', () => {
    const m = adaptToLocalMiner({
      ip: '10.0.0.5',
      snapshot: { minerStatus: MINER_STATUS },
    });
    expect(m.hostname).toBe('');
    expect(m.version).toBe('');
    expect(m.uptimeSeconds).toBe(0);
    expect(m.deviceModel).toBe('Hammer');
    // still resolves the core mining stats
    expect(m.hashRate).toBeCloseTo(6947.5164923, 3);
    expect(m.asicCount).toBe(4);
    expect(m.asicTemps).toEqual([57.8, 58.3, 58.8, 57.8]);
    expect(m.minerType).toBe('hammer');
    expect(m.hammerApiVersion).toBe(2);
  });

  it('caps optional chip telemetry but keeps the logical chip count', () => {
    const chips = Array.from({ length: 5000 }, (_, chip_id) => ({
      chip_id,
      domain_id: chip_id,
      temperature: 55,
      hashrate: 1,
      hardware_errors: 0,
      status: 'active' as const,
    }));
    const m = adaptToLocalMiner({
      ip: '10.0.0.6',
      snapshot: {
        minerStatus: { ...MINER_STATUS, chips },
        deviceInfo: { ...DEVICE_INFO, detected_chips_count: 5000 },
      },
    });
    expect(m.asicCount).toBe(5000);
    expect(m.asicTemps).toHaveLength(4096);
  });
});

describe('hammer updateConfig', () => {
  const CONFIG = {
    ok: true,
    data: {
      pool_url: 'parasite.wtf',
      pool_worker: 'old.Worker',
      pool_port: 42069,
      fallback_pool_url: 'btc.zsolo.bid',
      fallback_pool_worker: 'fb',
      fallback_pool_port: 6060,
      core_frequency: 800,
      core_voltage: 490,
      boot_mode: 2,
      Customizefrequency: 800,
      coreCustomizeVoltage: 490,
      fan_mode: 0,
      fan_target_speed: 45,
    },
  };

  it('merges changed fields onto the fetched config and PUTs it', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // GET /v2/miner/config
      .mockResolvedValueOnce(
        new Response(JSON.stringify(CONFIG), { status: 200 })
      )
      // PUT /v2/miner/config
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    const result = await updateConfig('1.2.3.4', {
      frequency: 750,
      stratumUser: 'new.Worker',
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[0]).toBe('http://1.2.3.4/v2/miner/config');
    expect(putCall[1]?.method).toBe('PUT');
    const body = JSON.parse(putCall[1]?.body as string);
    // Changed fields applied
    expect(body.core_frequency).toBe(750);
    expect(body.Customizefrequency).toBe(750);
    expect(body.pool_worker).toBe('new.Worker');
    // Frequency change forces customize boot mode
    expect(body.boot_mode).toBe(2);
    // Untouched fields preserved from the fetched config
    expect(body.pool_url).toBe('parasite.wtf');
    expect(body.fallback_pool_port).toBe(6060);
    expect(body.core_voltage).toBe(490);
  });
});
