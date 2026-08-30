import { describe, expect, it, vi } from 'vitest';

// avalon.ts imports react-native-tcp-socket at module load; it's a native
// module with no Node entry point. The functions under test never touch the
// socket, so a bare stub is enough to let the module import in vitest's node env.
vi.mock('react-native-tcp-socket', () => ({ default: {} }));

import {
  AVALON_MAX_RESPONSE_BYTES,
  parseMmSummary,
  parseHbInfo,
  isAvalonStandby,
  adaptToLocalMiner,
  type AvalonVersion,
  type AvalonSummary,
  type AvalonStats,
  type AvalonAdapterInput,
} from '../avalon';

// --- Fixtures ---------------------------------------------------------------

// Real MM ID0:Summary blob from a live Avalon Q (MM319) in standby, trimmed of
// the large NETFAIL/PLL/ATA arrays. Note TMax/TAvg/GHSspd/fans read 0 while
// idle, but GHSavg/GHSmm and the summary's "MHS av" stay high.
const STANDBY_MM =
  "'STATS':{Ver[Q-25052801_14a19a2] DNA[020100002fa7f22f] STATE[2] " +
  'SYSTEMSTATU[Work: In Idle, Hash Board: 1] Elapsed[1860367] DH[2.532%] ' +
  'ITemp[24] HBITemp[32] HBOTemp[32] TMax[0] TAvg[0] TarT[65] ' +
  'Fan1[0] Fan2[0] Fan3[0] Fan4[0] FanR[0%] PS[0 1216 1 0 0 2243 17] ' +
  'GHSspd[0.00] GHSmm[56112.38] GHSavg[70967.01] Freq[288.41] TA[160] ' +
  'Core[A3197S] PING[22] SoftOFF[4] WORKMODE[0] WORKLEVEL[0] MPO[800]}';

// Same board actively hashing (synthetic: run-state Normal, ASICs hot & fans up).
const RUNNING_MM =
  "'STATS':{Ver[Q-25052801_14a19a2] DNA[020100002fa7f22f] STATE[1] " +
  'SYSTEMSTATU[Work: In Work, Hash Board: 1] Elapsed[1860367] DH[2.532%] ' +
  'ITemp[30] HBITemp[45] HBOTemp[48] TMax[65] TAvg[60] TarT[65] ' +
  'Fan1[3200] Fan2[3200] Fan3[3100] Fan4[3150] FanR[55%] ' +
  'PS[0 1216 1 0 0 2243 865] GHSspd[70200.00] GHSmm[70000.00] ' +
  'GHSavg[70100.00] Freq[500.00] TA[160] Core[A3197S] PING[20] ' +
  'WORKMODE[2] WORKLEVEL[0] MPO[900]}';

const VERSION: AvalonVersion = {
  CGMiner: '4.11.1',
  API: '3.7',
  PROD: 'Avalon Q',
  MODEL: 'Q',
  HWTYPE: 'Q_MM1v1_X1',
  SWTYPE: 'MM319',
  LVERSION: '25052801_14a19a2',
  BVERSION: '25052801_14a19a2',
  CGVERSION: '25052801_14a19a2',
  DNA: '020100002fa7f22f',
  MAC: '00e04c30f1f1',
};

function makeSummary(mhsAv: number): AvalonSummary {
  return {
    Elapsed: 1860367,
    'MHS av': mhsAv,
    'MHS 5s': 0,
    'MHS 1m': 0,
    'MHS 5m': 0,
    'MHS 15m': 0,
    'Found Blocks': 0,
    Getworks: 0,
    Accepted: 502310,
    Rejected: 1952,
    'Hardware Errors': 12,
    Utility: 16.22,
    'Difficulty Accepted': 0,
    'Difficulty Rejected': 0,
    'Best Share': 27394097318,
    'Device Hardware%': 0,
    'Device Rejected%': 0,
    'Pool Rejected%': 0,
  };
}

function makeInput(mmBlob: string, mhsAv: number): AvalonAdapterInput {
  const stats: AvalonStats = {
    mm: parseMmSummary(mmBlob),
    Elapsed: 1860367,
    ID: 'AVALON0',
  };
  return { ip: '192.168.13.102', version: VERSION, summary: makeSummary(mhsAv), pools: [], stats };
}

// --- Tests ------------------------------------------------------------------

describe('parseMmSummary', () => {
  it('extracts run-state and telemetry fields from a standby blob', () => {
    const mm = parseMmSummary(STANDBY_MM);
    expect(mm.STATE).toBe(2);
    expect(mm.SYSTEMSTATU).toBe('Work: In Idle, Hash Board: 1');
    expect(mm.GHSspd).toBe(0);
    expect(mm.TMax).toBe(0);
    expect(mm.HBOTemp).toBe(32);
    expect(mm.FanR).toBe(0); // trailing % stripped
  });
});

describe('parseHbInfo', () => {
  it('parses per-ASIC PVT_T0 into a number array', () => {
    const hb = parseHbInfo("'HB0':{PVT_T0[59 60 71 62] PVT_V0[282 282 276 278]}");
    expect(hb.PVT_T0).toEqual([59, 60, 71, 62]);
  });

  it('caps oversized telemetry arrays without affecting logical miner counts', () => {
    const values = Array.from({ length: 5000 }, (_, i) => i).join(' ');
    const hb = parseHbInfo(`'HB0':{PVT_T0[${values}]}`);
    expect(hb.PVT_T0).toHaveLength(4096);
    expect(AVALON_MAX_RESPONSE_BYTES).toBeGreaterThan(values.length);
  });
});

describe('isAvalonStandby', () => {
  it('is true when SYSTEMSTATU reports idle', () => {
    expect(isAvalonStandby(parseMmSummary(STANDBY_MM))).toBe(true);
  });

  it('is true when STATE === 2 even without SYSTEMSTATU', () => {
    expect(isAvalonStandby({ STATE: 2 })).toBe(true);
  });

  it('is false while actively hashing', () => {
    expect(isAvalonStandby(parseMmSummary(RUNNING_MM))).toBe(false);
  });
});

describe('adaptToLocalMiner — standby handling', () => {
  it('flags standby, substitutes a real temp, and keeps the lifetime hashrate', () => {
    const miner = adaptToLocalMiner(makeInput(STANDBY_MM, 70938664));
    expect(miner.isStandby).toBe(true);
    expect(miner.temp).toBe(32); // HBOTemp fallback, not the bogus TMax=0
    expect(miner.hashRate).toBeCloseTo(70938.664); // MHS av / 1000, unchanged
    expect(miner.realtimeHashrate).toBe(0); // GHSspd — actually not hashing
    expect(miner.isOnline).toBe(true); // standby is still reachable
  });

  it('falls back to the hottest ASIC temp when board temps are absent', () => {
    const input = makeInput(STANDBY_MM, 70938664);
    // Zero out the board temps and supply per-ASIC PVT data instead.
    input.stats.mm.HBOTemp = 0;
    input.stats.mm.HBITemp = 0;
    input.stats.mm.ITemp = 0;
    input.stats.hb = { PVT_T0: [59, 60, 71, 62] };
    expect(adaptToLocalMiner(input).temp).toBe(71);
  });

  it('leaves actively-hashing miners unchanged', () => {
    const miner = adaptToLocalMiner(makeInput(RUNNING_MM, 70100000));
    expect(miner.isStandby).toBeUndefined();
    expect(miner.temp).toBe(65); // TMax used directly
    expect(miner.realtimeHashrate).toBe(70200);
  });
});
