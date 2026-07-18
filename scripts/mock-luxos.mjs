#!/usr/bin/env node
/**
 * Mock LuxOS (Antminer S21 on Luxor firmware) for testing without hardware.
 *
 * Implements the HTTP RPC layer documented at docs.luxor.tech/firmware:
 *   POST /api  body {"command":"<name>","parameter":"a,b,c"}
 * including multi-command batching ("version+summary+..."), the session
 * lifecycle (logon/logoff/session, 60s idle expiry, single session),
 * and the write commands the app drives (rebootdevice, ledset,
 * profileset, addpool, removepool, switchpool).
 *
 * Usage:
 *   node scripts/mock-luxos.mjs        # port 8080 — no sudo needed
 *
 * Then add your dev machine's LAN IP as a manual miner in the app (or
 * run a discovery scan — the LuxOS probe hits port 8080).
 *
 * Scenario switching:
 *   curl -X POST localhost:8080/__scenario -d '{"scenario":"sleeping"}'
 *   scenarios: ok | ramp | busy-session | sleeping | slow | partial
 *   - ok            normal operation
 *   - ramp          fresh boot: low hashrate, Elapsed counts from 0
 *   - busy-session  logon always fails (another actor holds the session)
 *   - sleeping      curtailed: CurtailMode Sleep, PSU off, 0 GH/s
 *   - slow          3s latency on every response (timeout testing)
 *   - partial       temps/power/profiles sections return STATUS E
 *                   (exercises the app's best-effort snapshot parsing)
 * "Offline" = just Ctrl-C the process. `rebootdevice` goes genuinely
 * unresponsive for REBOOT_SECS (default 120), then ramps ~10 min.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const REBOOT_SECS = Number(process.env.REBOOT_SECS ?? 120);
const LUXMINER_VERSION = '2026.1.15.120000-mock0001';
const RAMP_SECS = 600; // post-boot hashrate ramp
const NAMEPLATE_THS = 200;

let scenario = 'ok';

// --- Device state -----------------------------------------------------------

let bootTime = Date.now();
let rebootingUntil = 0; // while Date.now() < this, drop all connections

const config = {
  profile: 'default',
  redLed: 'auto',
  greenLed: 'auto',
};

const PROFILES = [
  { name: '525MHz', freq: 525, ths: 170.6, watts: 2870, step: '-2' },
  { name: '555MHz', freq: 555, ths: 180.4, watts: 3090, step: '-1' },
  { name: 'default', freq: 585, ths: 200.0, watts: 3510, step: '0' },
  { name: '615MHz', freq: 615, ths: 210.2, watts: 3820, step: '1' },
  { name: '645MHz', freq: 645, ths: 220.5, watts: 4150, step: '2' },
];

let pools = [
  {
    id: 0,
    url: 'stratum+tcp://parasite.wtf:42069',
    user: 'bc1qmockluxosworkeraddressxxxxxxxxxxxx.s21',
    active: true,
  },
];
let nextPoolId = 1;

// Session: at most one, expires after 60s idle
let session = null; // { id, lastUsed }

const sessionValid = () =>
  session !== null && Date.now() - session.lastUsed < 60_000;

const touchSession = () => {
  if (session) session.lastUsed = Date.now();
};

const newSessionId = () =>
  Math.random().toString(36).slice(2, 10).padEnd(8, '0');

// --- Envelope helpers -------------------------------------------------------

const now = () => Math.floor(Date.now() / 1000);

function ok(dataKey, data, msg, code = 1) {
  const body = {
    STATUS: [
      {
        Code: code,
        Description: `LUXminer ${LUXMINER_VERSION}`,
        Msg: msg,
        STATUS: 'S',
        When: now(),
      },
    ],
    id: 1,
  };
  if (dataKey) body[dataKey] = Array.isArray(data) ? data : [data];
  return body;
}

function err(msg, code = 14) {
  return {
    STATUS: [
      {
        Code: code,
        Description: `LUXminer ${LUXMINER_VERSION}`,
        Msg: msg,
        STATUS: 'E',
        When: now(),
      },
    ],
    id: 1,
  };
}

// --- Simulated telemetry ----------------------------------------------------

const uptimeSecs = () => Math.floor((Date.now() - bootTime) / 1000);

/** Hashrate ramps linearly to nameplate over RAMP_SECS after boot */
function currentGhs() {
  if (scenario === 'sleeping') return 0;
  const profile = PROFILES.find((p) => p.name === config.profile);
  const targetGhs = (profile?.ths ?? NAMEPLATE_THS) * 1000;
  const up = uptimeSecs();
  const rampFactor = Math.min(1, up / RAMP_SECS);
  const jitter = 0.97 + Math.random() * 0.06;
  return Math.round(targetGhs * rampFactor * jitter * 100) / 100;
}

// --- Command handlers -------------------------------------------------------

/** Extract and validate the session id (first parameter) for [2] commands */
function requireSession(parameter) {
  const sid = (parameter ?? '').split(',')[0];
  if (!sessionValid() || sid !== session.id) {
    return null;
  }
  touchSession();
  return sid;
}

const commands = {
  version() {
    return ok(
      'VERSION',
      {
        API: '3.7',
        BMMiner: '1.0.0',
        CompileTime: 'Thu Jan 15 12:00:00 UTC 2026',
        LUXminer: LUXMINER_VERSION,
        Miner: 'uart_trans.1.3',
        Type: 'Antminer S21',
      },
      'LUXminer versions',
      22
    );
  },

  summary() {
    const ghs = currentGhs();
    return ok(
      'SUMMARY',
      {
        Accepted: 5231,
        'Best Session Share': 8123456,
        'Best Share': 214748364,
        'Device Hardware%': 0.0,
        'Device Rejected%': 0.0,
        'Difficulty Accepted': 342884352,
        'Difficulty Rejected': 65536,
        'Difficulty Stale': 0,
        Elapsed: uptimeSecs(),
        'GHS 30m': ghs * 0.995,
        'GHS 5s': ghs * (0.9 + Math.random() * 0.2),
        'GHS av': ghs,
        'Hardware Errors': 42,
        'Pool Rejected%': 0.02,
        'Pool Stale%': 0.0,
        Rejected: 1,
        Stale: 0,
        'Total MH': ghs * 1000,
        Utility: 17.35,
        'Work Utility': 21.87,
      },
      'Summary',
      11
    );
  },

  config() {
    const sleeping = scenario === 'sleeping';
    return ok(
      'CONFIG',
      {
        'ASC Count': 3,
        Cooling: 'Air',
        CurtailMode: sleeping ? 'Sleep' : 'None',
        DHCP: true,
        GreenLed: config.greenLed,
        HasDieTempOverheatCoverage: false,
        Hostname: 'LuxOS',
        IPAddr: '192.168.1.42',
        IsAtmEnabled: true,
        IsPowerSupplyOn: !sleeping,
        IsTuning: false,
        MACAddr: 'd4:33:b2:5d:e0:56',
        Model: 'Antminer S21',
        NameplateTHS: NAMEPLATE_THS,
        OS: 'LuxOS',
        'Pool Count': pools.length,
        Profile: config.profile,
        ProfileStep:
          PROFILES.find((p) => p.name === config.profile)?.step ?? '',
        RampMode: 'PowerTarget',
        RedLed: config.redLed,
        SerialNumber: 'MOCKS21XXXXXXXX01',
        SystemStatus: uptimeSecs() < 60 ? 'Initializing' : 'Normal',
      },
      'LUXminer config',
      33
    );
  },

  pools() {
    return ok(
      'POOLS',
      pools.map((p, i) => ({
        Accepted: p.active ? 5231 : 0,
        'Best Share': p.active ? 214748364 : 0,
        GROUP: 0,
        'Last Share Difficulty': p.active ? 65536 : 0,
        POOL: p.id,
        Priority: i,
        Quota: 1.0,
        Rejected: p.active ? 1 : 0,
        Stale: 0,
        Status: scenario === 'sleeping' ? 'Disabled' : p.active ? 'Alive' : 'Connecting',
        'Stratum Active': scenario !== 'sleeping' && p.active,
        'Stratum URL': p.url.replace(/^stratum\+tcp:\/\//, ''),
        URL: p.url,
        User: p.user,
      })),
      `${pools.length} Pool(s)`,
      7
    );
  },

  fans() {
    if (scenario === 'partial') return err('Fan telemetry unavailable');
    const speed = scenario === 'sleeping' ? 20 : 65;
    return {
      ...ok(
        'FANS',
        [0, 1, 2, 3].map((id) => ({
          FAN: `FAN${id}`,
          ID: id,
          RPM: scenario === 'sleeping' ? 1500 : 5640 + id * 30,
          Speed: speed,
        })),
        '4 Fan(s)',
        202
      ),
      FANCTRL: [
        {
          FanMaxSpeed: 100,
          FanMinSpeed: 20,
          MinFans: 1,
          PowerOffSpeed: 20,
          QuietFanStartup: false,
        },
      ],
    };
  },

  temps() {
    if (scenario === 'partial') return err('Temp telemetry unavailable');
    // Air-cooled S21: four board sensors per board, no die sensors
    const base = scenario === 'sleeping' ? 28 : 52;
    return ok(
      'TEMPS',
      [0, 1, 2].map((id) => ({
        BottomLeft: base + id,
        BottomRight: base + id + 4,
        ID: id,
        TEMP: id,
        TopLeft: base + id + 2,
        TopRight: base + id + 6,
      })),
      '3 Temp(s)',
      201
    );
  },

  tempctrl() {
    return ok(
      'TEMPCTRL',
      {
        ChipDangerous: 100.0,
        ChipHot: 93.0,
        ChipTarget: 83.0,
        Dangerous: 70.0,
        Hot: 65.0,
        Mode: 'Automatic',
        Target: 45.0,
      },
      'Temperature control',
      200
    );
  },

  power() {
    if (scenario === 'partial') return err('Power telemetry unavailable');
    const profile = PROFILES.find((p) => p.name === config.profile);
    const watts =
      scenario === 'sleeping'
        ? 30
        : Math.round((profile?.watts ?? 3510) * (0.98 + Math.random() * 0.04));
    return ok('POWER', { PSU: true, Watts: watts }, 'Power usage', 311);
  },

  profiles() {
    if (scenario === 'partial') return err('Profiles unavailable');
    return ok(
      'PROFILES',
      PROFILES.map((p) => ({
        CanRestore: false,
        Frequency: p.freq,
        HasOverrides: false,
        Hashrate: p.ths,
        IsDynamic: true,
        IsTuned: false,
        'Profile Name': p.name,
        Step: p.step,
        Voltage: 13.4,
        Watts: p.watts,
      })),
      'List profiles',
      323
    );
  },

  logon() {
    if (scenario === 'busy-session') {
      return err('Session in use');
    }
    if (sessionValid()) return err('Session in use');
    session = { id: newSessionId(), lastUsed: Date.now() };
    return ok('SESSION', { SessionID: session.id }, 'Session created', 316);
  },

  logoff(parameter) {
    if (!requireSession(parameter)) return err('Invalid session');
    session = null;
    return ok(null, null, 'Session dropped', 317);
  },

  session() {
    return ok(
      'SESSION',
      { SessionID: sessionValid() ? session.id : '' },
      'Session information',
      319
    );
  },

  rebootdevice(parameter) {
    if (!requireSession(parameter)) return err('Invalid session');
    session = null;
    // Respond S first, then go dark and come back rebooted
    setTimeout(() => {
      rebootingUntil = Date.now() + REBOOT_SECS * 1000;
      bootTime = Date.now() + REBOOT_SECS * 1000;
    }, 500);
    console.log(`[mock-luxos] rebootdevice — dark for ${REBOOT_SECS}s`);
    return ok(null, null, 'Rebooting device', 328);
  },

  ledset(parameter) {
    if (!requireSession(parameter)) return err('Invalid session');
    const [, led, mode] = (parameter ?? '').split(',');
    if (!['red', 'green'].includes(led)) return err(`Invalid led '${led}'`);
    if (!['on', 'off', 'blink', 'auto'].includes(mode)) {
      return err(`Invalid mode '${mode}'`);
    }
    if (led === 'red') config.redLed = mode;
    else config.greenLed = mode;
    console.log(`[mock-luxos] ledset ${led}=${mode}`);
    return ok(null, null, 'LED mode set', 320);
  },

  profileset(parameter) {
    if (!requireSession(parameter)) return err('Invalid session');
    const name = (parameter ?? '').split(',')[1];
    const profile = PROFILES.find((p) => p.name === name);
    if (!profile) return err(`Unknown profile '${name}'`);
    config.profile = profile.name;
    // Profile change re-ramps the miner
    bootTime = Date.now();
    console.log(`[mock-luxos] profileset → ${profile.name}`);
    return ok(
      'PROFILE',
      { Board: 0, FrequencyStep: 5, Profile: profile.name, VoltageStep: 0.05 },
      'Profile Set',
      321
    );
  },

  // cgminer-namespace pool commands — no session required
  addpool(parameter) {
    const [url, user] = (parameter ?? '').split(',');
    if (!url || !user) return err('Invalid parameters');
    pools.push({ id: nextPoolId++, url, user, active: false });
    console.log(`[mock-luxos] addpool ${url} (${pools.length} total)`);
    return ok(null, null, `Added pool ${pools.length - 1}: '${url}'`, 55);
  },

  removepool(parameter) {
    const id = Number(parameter);
    const index = pools.findIndex((p) => p.id === id);
    if (index === -1) return err(`Invalid pool id ${parameter}`);
    const [removed] = pools.splice(index, 1);
    if (removed.active && pools.length > 0) pools[0].active = true;
    console.log(`[mock-luxos] removepool ${id}`);
    return ok(null, null, `Removed pool ${id}:'${removed.url}'`, 68);
  },

  switchpool(parameter) {
    const id = Number(parameter);
    const target = pools.find((p) => p.id === id);
    if (!target) return err(`Invalid pool id ${parameter}`);
    pools = [target, ...pools.filter((p) => p.id !== id)];
    pools.forEach((p, i) => {
      p.active = i === 0;
    });
    console.log(`[mock-luxos] switchpool → ${target.url}`);
    return ok(null, null, `Switching to pool ${id}: '${target.url}'`, 27);
  },
};

// --- RPC dispatch -----------------------------------------------------------

function execute(command, parameter) {
  const handler = commands[command];
  if (!handler) return err(`Invalid command '${command}'`);
  return handler(parameter);
}

function handleRpc(body) {
  const { command, parameter } = body;
  if (typeof command !== 'string' || command.length === 0) {
    return err('Missing command');
  }

  // Multi-command: parameterless only, each sub-result keyed by the
  // lowercase command name wrapping its full normal response
  if (command.includes('+')) {
    if (parameter !== undefined) {
      return err('Multi-command requests cannot have parameters');
    }
    const result = { id: 1 };
    for (const cmd of command.split('+')) {
      result[cmd] = [execute(cmd, undefined)];
    }
    return result;
  }

  return execute(command, parameter);
}

// --- HTTP server ------------------------------------------------------------

const server = http.createServer((req, res) => {
  // Rebooting: drop the connection without responding
  if (Date.now() < rebootingUntil) {
    req.socket.destroy();
    return;
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    const respond = (status, payload) => {
      const send = () => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (scenario === 'slow') setTimeout(send, 3000);
      else send();
    };

    if (req.method === 'POST' && req.url === '/__scenario') {
      try {
        const { scenario: next } = JSON.parse(raw);
        scenario = next;
        console.log(`[mock-luxos] scenario → ${scenario}`);
        respond(200, { ok: true, scenario });
      } catch {
        respond(400, { ok: false });
      }
      return;
    }

    if (req.method !== 'POST' || req.url !== '/api') {
      respond(404, { error: 'not found' });
      return;
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      respond(400, err('Invalid JSON'));
      return;
    }
    respond(200, handleRpc(body));
  });
});

server.listen(PORT, () => {
  console.log(`[mock-luxos] Antminer S21 (LuxOS ${LUXMINER_VERSION}) on :${PORT}`);
  console.log(`[mock-luxos] POST /api | scenarios via POST /__scenario`);
});
