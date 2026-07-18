import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adaptToLocalMiner,
  getActivePool,
  getSnapshot,
  isLuxOS,
  setProfile,
  type LuxOSSnapshot,
} from '../luxos';

afterEach(() => {
  vi.restoreAllMocks();
});

const STATUS_S = [
  {
    Code: 11,
    Description: 'LUXminer 2026.1.15.120000-mock0001',
    Msg: 'OK',
    STATUS: 'S',
    When: 1770000000,
  },
];

const STATUS_E = [
  {
    Code: 14,
    Description: 'LUXminer 2026.1.15.120000-mock0001',
    Msg: 'Section unavailable',
    STATUS: 'E',
    When: 1770000000,
  },
];

/** Wrap a single-command body into the documented multi-command shape */
const wrap = (inner: Record<string, unknown>) => [{ ...inner, STATUS: STATUS_S, id: 1 }];

const FULL_MULTI_RESPONSE = {
  version: wrap({
    VERSION: [{ API: '3.7', LUXminer: '2026.1.15.120000-mock0001', Type: 'Antminer S21' }],
  }),
  summary: wrap({
    SUMMARY: [
      {
        Accepted: 5231,
        'Best Session Share': 8123456,
        'Best Share': 214748364,
        Elapsed: 7200,
        'GHS 5s': 199000.5,
        'GHS av': 200123.4,
        'Hardware Errors': 42,
        Rejected: 1,
      },
    ],
  }),
  config: wrap({
    CONFIG: [
      {
        'ASC Count': 3,
        Cooling: 'Air',
        CurtailMode: 'None',
        GreenLed: 'auto',
        Hostname: 'LuxOS',
        IsAtmEnabled: true,
        IsPowerSupplyOn: true,
        MACAddr: 'd4:33:b2:5d:e0:56',
        Model: 'Antminer S21',
        NameplateTHS: 200,
        Profile: 'default',
        RedLed: 'auto',
        SerialNumber: 'MOCKS21XXXXXXXX01',
      },
    ],
  }),
  pools: wrap({
    POOLS: [
      {
        POOL: 0,
        Status: 'Dead',
        'Stratum Active': false,
        URL: 'stratum+tcp://backup.pool:3333',
        User: 'addr.backup',
      },
      {
        POOL: 1,
        Status: 'Alive',
        'Stratum Active': true,
        URL: 'stratum+tcp://parasite.wtf:42069',
        User: 'bc1qmock.s21',
      },
    ],
  }),
  fans: wrap({
    FANS: [
      { FAN: 'FAN0', ID: 0, RPM: 5640, Speed: 65 },
      { FAN: 'FAN1', ID: 1, RPM: 5670, Speed: 65 },
      { FAN: 'FAN2', ID: 2, RPM: 5700, Speed: 65 },
      { FAN: 'FAN3', ID: 3, RPM: 5730, Speed: 65 },
    ],
  }),
  temps: wrap({
    TEMPS: [
      { BottomLeft: 53, BottomRight: 57, ID: 1, TEMP: 1, TopLeft: 55, TopRight: 59 },
      { BottomLeft: 52, BottomRight: 56, ID: 0, TEMP: 0, TopLeft: 54, TopRight: 58 },
    ],
  }),
  tempctrl: wrap({
    TEMPCTRL: [
      {
        ChipDangerous: 100,
        ChipHot: 93,
        ChipTarget: 83,
        Dangerous: 70,
        Hot: 65,
        Mode: 'Automatic',
        Target: 45,
      },
    ],
  }),
  power: wrap({ POWER: [{ PSU: true, Watts: 3510 }] }),
  profiles: wrap({
    PROFILES: [
      {
        Frequency: 585,
        Hashrate: 200.0,
        IsDynamic: true,
        'Profile Name': 'default',
        Step: '0',
        Watts: 3510,
      },
      {
        Frequency: 525,
        Hashrate: 170.6,
        IsDynamic: true,
        'Profile Name': '525MHz',
        Step: '-2',
        Watts: 2870,
      },
    ],
  }),
  id: 1,
};

function stubFetchJson(payload: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    statusText: 'OK',
    json: async () => payload,
  }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function fullSnapshot(): Promise<LuxOSSnapshot> {
  stubFetchJson(FULL_MULTI_RESPONSE);
  const result = await getSnapshot('10.0.0.9');
  expect(result.success).toBe(true);
  if (!result.success) throw new Error('unreachable');
  return result.data;
}

describe('getSnapshot — multi-command unwrap', () => {
  it('parses the documented wrapped multi-command shape', async () => {
    const snapshot = await fullSnapshot();
    expect(snapshot.version.LUXminer).toBe('2026.1.15.120000-mock0001');
    expect(snapshot.summary['GHS av']).toBe(200123.4);
    expect(snapshot.config?.Model).toBe('Antminer S21');
    expect(snapshot.pools).toHaveLength(2);
    expect(snapshot.profiles).toHaveLength(2);
  });

  it('tolerates a defensive unwrapped (single-command style) shape', async () => {
    stubFetchJson({
      VERSION: [{ LUXminer: 'x.y.z' }],
      SUMMARY: [{ 'GHS av': 1000 }],
      STATUS: STATUS_S,
      id: 1,
    });
    const result = await getSnapshot('10.0.0.9');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary['GHS av']).toBe(1000);
      expect(result.data.config).toBeUndefined();
    }
  });

  it('degrades per-command STATUS E sections to undefined without failing', async () => {
    stubFetchJson({
      ...FULL_MULTI_RESPONSE,
      temps: [{ STATUS: STATUS_E, id: 1 }],
      power: [{ STATUS: STATUS_E, id: 1 }],
    });
    const result = await getSnapshot('10.0.0.9');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temps).toBeUndefined();
      expect(result.data.power).toBeUndefined();
      expect(result.data.summary['GHS av']).toBe(200123.4);
    }
  });

  it('fails with LUXOS_PARSE when version/summary are unrecognizable', async () => {
    stubFetchJson({ hello: 'world' });
    const result = await getSnapshot('10.0.0.9');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('LUXOS_PARSE');
  });
});

describe('adaptToLocalMiner', () => {
  it('maps the full snapshot (GH/s passthrough, active pool, profiles)', async () => {
    const snapshot = await fullSnapshot();
    const miner = adaptToLocalMiner({ ip: '10.0.0.9', snapshot });

    expect(miner.minerType).toBe('luxos');
    // GHS av is already GH/s — no conversion
    expect(miner.hashRate).toBe(200123.4);
    // Expected from active profile: 200 TH/s → 200000 GH/s
    expect(miner.expectedHashrate).toBe(200000);
    expect(miner.power).toBe(3510);
    expect(miner.deviceModel).toBe('Antminer S21');
    expect(miner.version).toBe('2026.1.15.120000-mock0001');
    expect(miner.uptimeSeconds).toBe(7200);
    // Active pool is the Stratum Active one, not pools[0]
    expect(miner.stratumUser).toBe('bc1qmock.s21');
    expect(miner.stratumUrl).toBe('parasite.wtf');
    expect(miner.stratumPort).toBe(42069);
    // Board-only temps: max across sensors; entries sorted by ID
    expect(miner.temp).toBe(59);
    expect(miner.luxosBoardTemps).toEqual([58, 59]);
    expect(miner.luxosChipTemps).toBeUndefined();
    expect(miner.fanRpms).toEqual([5640, 5670, 5700, 5730]);
    expect(miner.fanSpeed).toBe(65);
    expect(miner.autoFanSpeed).toBe(1);
    expect(miner.luxosProfile).toBe('default');
    expect(miner.luxosProfiles).toHaveLength(2);
    expect(miner.luxosAtmEnabled).toBe(true);
    expect(miner.luxosTempLimits?.hot).toBe(65);
    expect(miner.isStandby).toBe(false);
    expect(miner.bestDiff).toBe(214748364);
  });

  it('prefers chip-die temps when the model reports them', async () => {
    const snapshot = await fullSnapshot();
    snapshot.temps = [
      { ID: 0, TEMP: 0, BoardTopLeft: 55, ChipTopLeft: 78, ChipTopRight: 81 },
    ];
    const miner = adaptToLocalMiner({ ip: '10.0.0.9', snapshot });
    expect(miner.temp).toBe(81);
    expect(miner.luxosChipTemps).toEqual([81]);
    expect(miner.luxosBoardTemps).toEqual([55]);
  });

  it('never crashes on an empty snapshot (null tolerance)', () => {
    const miner = adaptToLocalMiner({
      ip: '10.0.0.9',
      snapshot: { version: {}, summary: {} },
    });
    expect(miner.hashRate).toBe(0);
    expect(miner.temp).toBe(0);
    expect(miner.expectedHashrate).toBe(0);
    expect(miner.stratumUser).toBe('');
    expect(miner.isOnline).toBe(true);
    expect(miner.luxosProfiles).toBeUndefined();
  });

  it('flags standby when curtailed or PSU off', async () => {
    const snapshot = await fullSnapshot();
    snapshot.config = { ...snapshot.config, CurtailMode: 'Sleep' };
    expect(adaptToLocalMiner({ ip: 'x', snapshot }).isStandby).toBe(true);
    snapshot.config = { ...snapshot.config, CurtailMode: 'None', IsPowerSupplyOn: false };
    expect(adaptToLocalMiner({ ip: 'x', snapshot }).isStandby).toBe(true);
  });
});

describe('getActivePool', () => {
  it('prefers Stratum Active, then Alive, then first', () => {
    expect(getActivePool(undefined)).toBeUndefined();
    expect(getActivePool([])).toBeUndefined();
    const dead = { POOL: 0, Status: 'Dead' };
    const alive = { POOL: 1, Status: 'Alive' };
    const active = { POOL: 2, 'Stratum Active': true };
    expect(getActivePool([dead, alive, active])?.POOL).toBe(2);
    expect(getActivePool([dead, alive])?.POOL).toBe(1);
    expect(getActivePool([dead])?.POOL).toBe(0);
  });
});

describe('isLuxOS probe', () => {
  it('accepts a LUXminer version response', async () => {
    stubFetchJson({
      VERSION: [{ LUXminer: '2026.1.15.120000' }],
      STATUS: STATUS_S,
      id: 1,
    });
    expect(await isLuxOS('10.0.0.9')).toBe(true);
  });

  it('accepts via the STATUS Description signature alone', async () => {
    stubFetchJson({ STATUS: STATUS_S, id: 1 });
    expect(await isLuxOS('10.0.0.9')).toBe(true);
  });

  it('rejects arbitrary port-8080 JSON servers', async () => {
    stubFetchJson({ ok: true, service: 'some-web-app' });
    expect(await isLuxOS('10.0.0.9')).toBe(false);
  });

  it('rejects non-2xx and network errors', async () => {
    stubFetchJson({}, false, 500);
    expect(await isLuxOS('10.0.0.9')).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    expect(await isLuxOS('10.0.0.9')).toBe(false);
  });
});

describe('setProfile guard', () => {
  it('rejects numeric 0-3 names (legacy board_id trap) before any request', async () => {
    const fetchMock = stubFetchJson({});
    const result = await setProfile('10.0.0.9', '2');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('LUXOS_BAD_PROFILE');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
