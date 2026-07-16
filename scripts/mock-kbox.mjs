#!/usr/bin/env node
/**
 * Mock GekkoScience KBox for testing the app without hardware.
 *
 * Implements the documented /api/v1/ surface (firmware v1.19.4):
 *   GET  /api/v1/status | /devices | /pools | /dual | /led/effects
 *   POST /api/v1/led | /fan | /power | /restart
 * with X-API-Key auth (401 unauthorized / 403 api_disabled), the 90s
 * restart debounce, and a ~60s post-restart hashrate ramp.
 *
 * Usage:
 *   sudo PORT=80 node scripts/mock-kbox.mjs
 *   (the app talks to port 80; sudo is required to bind it on macOS)
 *
 * Then add your dev machine's LAN IP as a manual miner in the app.
 * API key: 0123456789abcdef0123456789abcdef
 *
 * Scenario switching (no auth required):
 *   curl -X POST localhost/__scenario -d '{"scenario":"unauthorized"}'
 *   scenarios: ok | ramp | unauthorized | api_disabled | slow
 *   - ok           normal operation
 *   - ramp         status fields come back null (startup ramp)
 *   - unauthorized every authed request 401s (simulates key regen)
 *   - api_disabled every authed request 403s
 *   - slow         3s latency on every response (timeout testing)
 * "Offline" = just Ctrl-C the process.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 80);
const API_KEY = process.env.KEY ?? '0123456789abcdef0123456789abcdef';

let scenario = 'ok';

// --- Device state -----------------------------------------------------------

const bootTime = Date.now();
let lastRestartTime = bootTime; // for uptime + ramp
let lastRestartRequest = 0; // for the 90s debounce

const state = {
  accepted: 1234,
  rejected: 5,
  hardware_errors: 0,
  best_share: '301K',
  pool: {
    url: 'stratum+tcp://solo.ckpool.org:3333',
    user: 'bc1qmockkboxworkeraddressxxxxxxxxxxxxx.kbox1',
    difficulty: 442,
  },
  power_mode: 'Medium',
  fan_percent: 40,
  fan_auto: true,
  dual_mining: false,
  led: {
    on: true,
    effect: 'Wave',
    color: { r: 255, g: 90, b: 0 },
    speed: 132,
    brightness: 255,
  },
};

const EFFECTS = [
  ['On (Static)', 'Basic', true], ['Wave', 'Basic', true], ['Pulse', 'Basic', true],
  ['Flash', 'Basic', true], ['Breathe', 'Basic', true], ['Twinkle', 'Basic', true],
  ['Strobe', 'Basic', true], ['Sparkle', 'Basic', true],
  ['Scanner', 'Motion', true], ['Comet', 'Motion', true], ['Meteor', 'Motion', true],
  ['ColorWipe', 'Motion', true], ['TheaterChase', 'Motion', true], ['Gradient', 'Motion', true],
  ['Rainbow', 'Colour', false], ['OffsetRainbow', 'Colour', false],
  ['Aurora', 'Colour', false], ['Freedom', 'Colour', false],
  ['Fire', 'Ambient', false], ['Fireplace', 'Ambient', false], ['Woodstove', 'Ambient', false],
  ['Embers', 'Ambient', false], ['Lava', 'Ambient', false], ['Candle', 'Ambient', false],
  ['Sunrise', 'Ambient', false], ['Ocean', 'Ambient', false],
  ['GekkoScience', 'Brand', false],
].map(([name, group, color]) => ({
  name,
  label: name,
  color,
  group,
  desc: `${name} effect`,
}));

// --- Helpers ----------------------------------------------------------------

const uptimeS = () => Math.floor((Date.now() - lastRestartTime) / 1000);

/** Hashrate ramps 0 → ~4.21 TH/s over the first 60s after (re)start */
function currentHashrate() {
  const up = uptimeS();
  if (up >= 60) return 4.21 + (Math.sin(Date.now() / 30000) * 0.15);
  return Number(((up / 60) * 4.21).toFixed(2));
}

function json(res, status, body) {
  const send = () => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(body));
  };
  if (scenario === 'slow') setTimeout(send, 3000);
  else send();
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

// --- Server -----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') return json(res, 200, {});

  // Control endpoint for tests (never part of the real device)
  if (path === '/__scenario' && req.method === 'POST') {
    const body = await readBody(req);
    if (body?.scenario) {
      scenario = body.scenario;
      console.log(`[mock-kbox] scenario -> ${scenario}`);
    }
    return json(res, 200, { ok: true, scenario });
  }

  if (!path.startsWith('/api/v1')) {
    // Real unit serves its dashboard here; a plain 404 is fine for us
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('mock-kbox: not the dashboard');
  }

  // Auth — required on every /api/v1 request
  if (scenario === 'api_disabled') {
    return json(res, 403, { ok: false, error: 'api_disabled' });
  }
  const key = req.headers['x-api-key'];
  if (scenario === 'unauthorized' || key !== API_KEY) {
    return json(res, 401, { ok: false, error: 'unauthorized' });
  }

  const sub = path.slice('/api/v1'.length) || '/';

  if (req.method === 'GET') {
    switch (sub) {
      case '/status': {
        if (scenario === 'ramp') {
          // Startup ramp: any field may be null/absent
          return json(res, 200, {
            ok: true,
            hashrate_ths: null,
            hashrate_1m_ths: null,
            accepted: null,
            rejected: null,
            hardware_errors: null,
            best_share: null,
            uptime_s: 12,
            temperature_c: null,
            pool: null,
            power_mode: state.power_mode,
            fan_percent: state.fan_percent,
            dual_mining: null,
            led: null,
          });
        }
        return json(res, 200, {
          ok: true,
          hashrate_ths: currentHashrate(),
          hashrate_1m_ths: Math.max(0, currentHashrate() - 0.16),
          accepted: (state.accepted += Math.random() < 0.3 ? 1 : 0),
          rejected: state.rejected,
          hardware_errors: state.hardware_errors,
          best_share: state.best_share,
          uptime_s: uptimeS(),
          temperature_c: uptimeS() < 60 ? 45.0 : 68.0,
          pool: state.pool,
          power_mode: state.power_mode,
          fan_percent: state.fan_percent,
          dual_mining: state.dual_mining,
          led: state.led,
        });
      }
      case '/devices':
        return json(res, 200, {
          ok: true,
          devices: [
            {
              id: 0,
              status: 'Alive',
              enabled: 'Y',
              temperature_c: 68.0,
              hashrate_ths: currentHashrate(),
              accepted: state.accepted,
              rejected: state.rejected,
              hardware_errors: state.hardware_errors,
              frequency: state.power_mode === 'Low' ? 400 : state.power_mode === 'High' ? 560 : 490,
            },
          ],
        });
      case '/pools':
        return json(res, 200, {
          ok: true,
          pools: [
            {
              index: 0,
              url: state.pool.url,
              user: state.pool.user,
              status: 'Alive',
              active: true,
              quota: 1,
              accepted: state.accepted,
              rejected: state.rejected,
              work_difficulty: state.pool.difficulty,
            },
          ],
        });
      case '/dual':
        return json(res, 200, {
          ok: true,
          enabled: state.dual_mining,
          bias: 71,
          total_ths: currentHashrate(),
          pools: [],
        });
      case '/led/effects':
        return json(res, 200, { ok: true, effects: EFFECTS });
      default:
        return json(res, 404, { ok: false, error: 'not_found' });
    }
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body === null) return json(res, 400, { ok: false, error: 'bad_json' });

    switch (sub) {
      case '/led': {
        if (body.effect !== undefined) {
          const match = EFFECTS.find(
            (e) => e.name.toLowerCase() === String(body.effect).toLowerCase()
          );
          if (!match) {
            return json(res, 400, {
              ok: false,
              error: 'unknown_effect',
              message: `Unknown effect. Valid: ${EFFECTS.map((e) => e.name).join(', ')}`,
            });
          }
          state.led.effect = match.name;
        }
        if (body.color) state.led.color = body.color;
        if (typeof body.speed === 'number') state.led.speed = body.speed;
        if (typeof body.brightness === 'number') state.led.brightness = body.brightness;
        // color/effect/brightness implicitly turn the lights on
        if (body.on !== undefined) state.led.on = !!body.on;
        else if (body.color || body.effect !== undefined || body.brightness !== undefined)
          state.led.on = true;
        return json(res, 200, { ok: true, led: state.led });
      }
      case '/fan': {
        if (body.mode === 'auto' || body.percent === 0) {
          state.fan_auto = true;
          state.fan_percent = 40;
        } else if (typeof body.percent === 'number') {
          state.fan_auto = false;
          state.fan_percent = Math.min(100, Math.max(0, body.percent));
        } else {
          return json(res, 400, { ok: false, error: 'bad_request' });
        }
        return json(res, 200, {
          ok: true,
          fan_percent: state.fan_percent,
          auto: state.fan_auto,
        });
      }
      case '/power': {
        if (body.mode) {
          if (!['Low', 'Medium', 'High'].includes(body.mode)) {
            return json(res, 400, { ok: false, error: 'bad_mode' });
          }
          state.power_mode = body.mode;
          return json(res, 200, { ok: true, mode: state.power_mode });
        }
        if (typeof body.freq === 'number' && typeof body.corev === 'number') {
          if (body.freq < 250 || body.freq > 650 || body.corev < 260 || body.corev > 320) {
            return json(res, 400, { ok: false, error: 'out_of_range' });
          }
          state.power_mode = 'Custom';
          return json(res, 200, {
            ok: true,
            mode: 'Custom',
            freq: body.freq,
            corev: body.corev,
            fan_percent: state.fan_percent,
          });
        }
        return json(res, 400, { ok: false, error: 'bad_request' });
      }
      case '/restart': {
        const now = Date.now();
        if (now - lastRestartRequest < 90_000) {
          return json(res, 400, {
            ok: false,
            error: 'debounced',
            message: 'Restart allowed at most once per 90 seconds.',
          });
        }
        lastRestartRequest = now;
        lastRestartTime = now; // uptime resets, hashrate ramps from 0
        console.log('[mock-kbox] restart — uptime reset, ramping for 60s');
        return json(res, 200, {
          ok: true,
          message: 'Miner restarting - hashrate returns in about a minute.',
        });
      }
      default:
        return json(res, 404, { ok: false, error: 'not_found' });
    }
  }

  return json(res, 405, { ok: false, error: 'method_not_allowed' });
});

server.listen(PORT, () => {
  console.log(`[mock-kbox] listening on :${PORT}`);
  console.log(`[mock-kbox] API key: ${API_KEY}`);
  console.log(`[mock-kbox] scenario: ${scenario} (POST /__scenario to change)`);
});
