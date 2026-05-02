# Canaan Avalon Miner API

Reverse-engineered against an **Avalon Q** on a local LAN (firmware
`25052801_14a19a2`, MM319, CGMiner 4.11.1, API 3.7). Other Canaan
Avalon devices (Nano 3S, Mini 3, A-series) appear to share the same
two-API surface — the web UI HTML even branches on `hwtype` for `Q`,
`Nano3s`, and `Mini3` — but command vocabularies differ per model. Use
this as a starting point and probe each new model.

Cross-reference: official Avalon A10 Universal API manual
(https://github.com/Canaan-Creative/avalon10-docs/) — most A10 commands
do **not** work as-is on the Avalon Q firmware (see "Avalon Q
deviations" below).

## Two parallel APIs

| Surface | Port | Auth | Use |
|---|---|---|---|
| CGMiner JSON RPC | TCP 4028 | **None** | Read stats, send `ascset` write commands |
| Web HTTP CGI | TCP 80 | **Cookie** (admin password) | Browser dashboard + pool config |

The mobile companion app — which only needs the device IP — almost
certainly talks to **port 4028**, since that interface is open and
unauthenticated. The web UI is a separate, password-gated surface that
overlaps in functionality (dashboard, pool config, reboot) but is not
required for monitoring.

For our app's discovery + monitoring use case, **prefer port 4028**.
Only fall back to the web CGIs for actions the cgminer interface
doesn't expose (and require the user to enter the admin password).

---

## 1. CGMiner API (port 4028)

### Connection model
- TCP, **short connections**: open socket, send one command, read reply,
  close. Reusing the socket for a second command is unsupported.
- **Single-threaded** on the device side. Serialize requests; do not
  pipeline.
- Request: a single JSON object, no trailing newline required.
- Response: JSON object terminated by `\0` (null byte) — strip it before
  parsing.

### Request format
```json
{"command":"<cmd>","parameter":"<args>"}
```
`parameter` is omitted for commands that take no args. For `ascset`, the
parameter is a comma-joined list: `"<ASC_id>,<option>[,<value>...]"`.

### Response format
```json
{
  "STATUS":[{"STATUS":"S|I|E","When":<unix>,"Code":<n>,"Msg":"...","Description":"cgminer 4.11.1"}],
  "<SECTION>":[ ... ],
  "id":1
}
```
- `STATUS`: `S` success, `I` info, `E` error.
- The data section name varies by command (`VERSION`, `SUMMARY`,
  `POOLS`, `STATS`, `DEVS`, `CONFIG`, `COIN`, `LCD`, `CHECK`).

### Confirmed read commands (no auth)

| Command | Returns | Notes |
|---|---|---|
| `version` | `VERSION[]` | Model, DNA, MAC, firmware, hashboard/fan MCU versions |
| `summary` | `SUMMARY[]` | Aggregate hashrate (5s/1m/5m/15m/avg), accepted/rejected, difficulty |
| `pools` | `POOLS[]` | Per-pool: URL, user, status, stratum diff, last-share time, etc. |
| `stats` | `STATS[]` | Deep telemetry — see "STATS payload" below |
| `devs` | `DEVS[]` | Per-ASC device: hashrate, accepted/rejected, temperature |
| `config` | `CONFIG[]` | ASC count, pool count, strategy, log interval |
| `estats` | `STATS[]` + `HBinfo` | Same as `stats` plus per-board PVT temperatures, voltages, MW counts |
| `coin` | `COIN[]` | Network difficulty, current block hash, block age |
| `lcd` | `LCD[]` | Compact summary intended for LCD display |
| `check` | `CHECK[]` | `{"command":"check","parameter":"<cmd>"}` → `{Exists:Y/N, Access:Y/N}` for that command |

Examples we ran live against the device are recorded in the "Sample
responses" section at the end.

### `ascset` write commands

Format: `{"command":"ascset","parameter":"<ASC_id>,<option>[,<value>...]"}`
where `ASC_id` is the device index (always `0` for single-board units).

A successful write returns `STATUS:S`. Unknown options return:
```
{"STATUS":"E","Code":120,"Msg":"ASC 0 set failed: Unknown option: <opt>"}
```
or, when the option is recognized but the argument is malformed:
```
"ASC 0 set failed: <opt> unknown argument"
"ASC 0 set failed: missing <opt> setting"
```
Use this distinction to feature-detect: a "Unknown option" reply means
the firmware doesn't expose the knob at all; "unknown argument" /
"missing setting" means the option exists but our payload was wrong.

#### Avalon Q `ascset` options (probed)

**The full ascset option list is self-describing on this firmware.**
Send `{"command":"ascset","parameter":"0,help"}` and the miner returns
the complete vocabulary as an info message. On Avalon Q MM319:

```
help|voltage|fan-spd|lcd|hash-sn-read|hash-sn-write|volt-tuning|
workmode|worklevel|work_mode_lvl|reboot|softon|softoff|filter-clean|
facopts|faclock|activate|solo-allowed|frequency|loop|password|
qr_auth|time
```

**Argument grammar.** Most options use a `<verb>,<value>` sub-syntax
that the A10 manual doesn't describe at all:

```
ascset|0,<option>,get                    → query current value
ascset|0,<option>,set,<value>            → apply value
ascset|0,<option>,<value>                → bare-value form (some opts only, e.g. reboot)
```

The bare-value form (`reboot,0`) is the historical A10 syntax. The
verb-prefixed form (`workmode,set,1`) is what the Q firmware expects
for most adjustable knobs. **`workmode,1` fails with "unknown
argument" — you must write `workmode,set,1`.** This is the single
biggest gap between the A10 docs and current firmware.

| Option | Verified behavior on Avalon Q | Notes |
|---|---|---|
| `reboot,0` | ✅ Set OK; ~3m49s recovery time | Bare-value form. No reboot for `reboot,get` (no such verb). |
| `workmode,get` | ✅ Returns `"workmode 1"` (int 0/1/2) | 0=Eco, 1=Standard, 2=Super |
| `workmode,set,<n>` | ✅ Set OK with `n ∈ {0,1,2}` on Q | **Reboot required** for new mode to take effect (per Canaan Mini 3 KB) |
| `worklevel,get` | ✅ Returns `"worklevel 0"` | Sub-step within mode |
| `worklevel,set,<n>` | Not verified — same shape expected | |
| `work_mode_lvl,get` | ✅ Returns `"workmode 1 worklevel 0"` | Combined query — convenient |
| `voltage,set,<mV>` | Range exposed via error: `2150~2600` | Per-modular-index voltage in mV |
| `frequency,get` | Returns Set OK, no info field | Get is not implemented? Use `stats` to read current `Freq[…]`. |
| `fan-spd,set,<value>` | Needs value (`No value passed to avalon-fan`) | Note: hyphen, not `fan` |
| `lcd,0:<n>` | `<n>` = `1` on, `0` off | Index-prefixed: `lcd,<idx>:<value>`. Matches `LcdOnoff[1]` in stats. |
| `softoff,1:<unix-ts>` | Set OK | Index-prefixed; `<unix-ts>` is when to enter standby (use `now+5s`) |
| `softon,1:<unix-ts>` | Set OK | Same shape; wake from standby at the given timestamp |
| `loop,get` | ✅ Returns `"LOOP[160 ]"` | Total ASIC count loopback |
| `time,get` | ✅ Returns `"time t:America/Chicago"` | Timezone string |
| `time,set,<tz>` | Not verified | Likely takes Olson tz strings |
| `softon` / `softoff` | See above — uses `1:<ts>` index/timestamp form | Soft-power on/off, no full reboot |
| `filter-clean,set,<value>` | Needs value | Reset air-filter cleaning reminder |
| `solo-allowed,set,<value>` | Needs value | Enable/disable solo mining |
| `facopts` | `Please unlock before setting facopts` | Gated behind `faclock` |
| `faclock` | `Lock: True` | Factory lock — read-only on shipped units |
| `activate` | `set activation param error` | Needs activation key (out of scope) |
| `volt-tuning` | `Invalid modular index` | Different arg shape; not investigated |
| `password,set,<old>,<new>` | Needs 2 args | **Changes the device admin password** — handle carefully |
| `qr_auth,get` | Returns Set OK | QR-login token rotation? |
| `hash-sn-read` / `hash-sn-write` | Not probed | Hashboard serial number |
| `setpool` | ❌ Not in option list | Pool config must use web CGI `cgpools.cgi` |
| `led,*` | ❌ Not in option list | No LED-identify equivalent on Q |
| `hashpower,*` | ❌ Not in option list | A10-only |

**Self-discovery idiom (preferred over A10 docs):**

```js
// 1. Get the full option list for THIS firmware version
const help = await ascset('0,help');     // returns "help|voltage|fan-spd|..."

// 2. For each option, query its current value
const cur = await ascset(`0,${opt},get`);

// 3. To probe write format without applying, send `0,<opt>,set` with no value
//    → "missing setting" / "No value passed" → format is `,set,<value>`
const probe = await ascset(`0,${opt},set`);
```

**Reboot recovery time (Avalon Q, MM319 firmware):** ~3m49s from
ascset trigger to a successful `version` reply, observed in our test.
Plan a 4-minute polling timeout for "did the reboot succeed" UX. The
official Canaan firmware probably warm-restarts faster on subsequent
reboots; this measurement is for a cold post-mining-load cycle.

**Workmode change UX requirement:** per Canaan's Mini 3 KB article,
*"after switching modes, you need to reboot the miner to make the new
working mode take effect."* The app should prompt for a reboot
immediately after a successful `workmode,set` call.

**Capability detection idiom:** poke each option with a deliberately
invalid value and inspect the error message:
- `Unknown option: <name>` → option not present on this firmware
- `<name> unknown argument` → option exists, value malformed (often
  means you're missing the `set` verb — try `<name>,set,<value>`)
- `missing <name> setting` / `No value passed to <name>` → option
  exists, just needs a value

This lets us feature-detect without applying a write. Used in
`avalon.probeWriteCapabilities()` in the app.

**Sources for the verb-prefixed grammar discovery:**
- [avalon-q-controller](https://github.com/gbechtel-beck/avalon-q-controller) — third-party Avalon Q controller using `workmode,set,<n>` form
- [Canaan Mini 3 modes KB](https://help.canaan.io/hc/en-us/articles/43169816917529-Technical-Documentation-Explanation-of-Avalon-Mini-3-Modes) — official mode list + reboot requirement
- [Heatpunks forum: Canaan Avalon home miner APIs](https://forum.heatpunks.org/t/canaan-avalon-home-miner-apis/168) — community API discussion

**Important takeaway:** the A10 manual is *not* a reliable spec for the
Avalon Q. Verify each option per model. The Q uses different option
names (e.g. `worklevel` instead of `workmode`, `frequency` is
adjustable from cgminer rather than only from the web UI).

To finish mapping the Q's write surface we need either the privileged
API PDF (linked from the upstream repo but binary) or to brute-force a
list against `ascset`. Brute-force is safe as long as we use clearly
invalid values — the firmware will report "unknown argument" rather
than apply a bad write.

### Error codes seen
| Code | Meaning |
|---|---|
| 7 | Pools list (`Msg: "<n> Pool(s)"`) |
| 9 | Devs list (`Msg: "<n> ASC(s)"`) |
| 11 | Summary OK |
| 14 | **Invalid command** — command name not in this firmware |
| 22 | Version OK |
| 33 | Config OK |
| 70 | CGMiner stats OK |
| 71 | Missing parameter (e.g. `check` with no arg) |
| 72 | Check command OK |
| 78 | Coin OK |
| 120 | **ASC set failed** — `Msg` field has the specific reason |
| 125 | LCD OK |

---

## 2. Web HTTP CGI (port 80)

Static SPA served from `/`. All actions are CGI scripts under `/`.
JavaScript glue uses both `XMLHttpRequest` (for read-style endpoints
that return JSONP-ish `eval`-able payloads) and form POSTs (for state
changes and page navigation).

### Auth scheme

Cookie-based, hash-and-salt with a server-issued nonce:

1. **GET** `/get_auth.cgi?num=<random>` (no auth required) — returns a
   JSONP callback:
   ```
   getAuthCallback({"auth":"<8-hex-salt>","code":"<24-hex-token>"});
   ```
   The `auth` field is the salt to use for the next login. The `code`
   field is returned but the client-side JS doesn't read it; purpose
   unknown (possibly a CSRF token used elsewhere). On our test device
   the salt was stable across requests over short intervals — don't
   assume it's per-request random.

2. Compute:
   ```
   passwd = auth + sha256(plaintext_password).slice(0, 24)
   ```
   Default password is `admin` → `sha256("admin").slice(0,24)` =
   `8c6976e5b5410415bde908bd`.

3. **POST** `/login.cgi` with:
   - Header: `Cookie: auth=<passwd>`
   - Body (form-encoded): `passwd=<passwd>`

   Success → 200 with the dashboard HTML. Failure → 200 with the login
   HTML (no Set-Cookie either way; the cookie is purely client-set).

4. For all subsequent CGI calls, include `Cookie: auth=<passwd>`.
   Without it, every CGI returns the login page (HTTP 200, ~21KB HTML).

### CGI endpoints

| Endpoint | Method | Auth | Body | Returns |
|---|---|---|---|---|
| `/get_auth.cgi?num=<rand>` | GET | no | — | `getAuthCallback({"auth":"...","code":"..."})` JSONP |
| `/login.cgi` | POST | no | `passwd=<hashed>` | Dashboard HTML on success |
| `/logout.cgi` | POST | yes | — | Login HTML |
| `/dashboard.cgi` | POST | yes | empty (`-d ""` so server gets `Content-Length: 0`) | Dashboard HTML |
| `/get_dashboard.cgi?num=<rand>` | GET | yes | — | `dashboardCallback({...})` JSONP — see fields below |
| `/poolconfig.cgi` | POST | yes | empty | Pool config HTML (current pools rendered into form) |
| `/cgpools.cgi` | POST | yes | `pool1=...&worker1=...&passwd1=...&pool2=...&...&pool3=...` | Pool config save |
| `/reboot.cgi` | POST | yes | — | Triggers reboot |
| `/qr_login.cgi` | POST | no | — | QR login flow (not investigated) |
| `/sha256.min.js` | GET | no | — | SHA-256 lib used by login page |

**Quirk:** the CGI server hangs when a POST has no `Content-Length`
header. `curl -X POST` alone times out; `curl -X POST -d ""` (which
sends `Content-Length: 0`) works.

### `get_dashboard.cgi` payload (Avalon Q)

JSONP `dashboardCallback({...})` with these string fields (yes, all
values are strings even when numeric):

| Field | Example | Meaning |
|---|---|---|
| `hwtype` | `"Avalon Q"` | Used by JS to set display name. Substrings checked: `Q`, `Nano3s`, `Mini3` |
| `sys_status` | `"1"` | `0` Init, `1` Normal, `2` Idle |
| `elapsed` | `"1968"` | Uptime seconds |
| `workingmode` | `"1"` | `0` Eco, `1` Standard, `2` Super |
| `workinglevel` | `"0"` | Sub-level within mode (purpose TBD) |
| `workingstatus` | `"1"` | `0` Init, `1` Fine, `2` Idle |
| `power` | `"1391"` | Watts |
| `realtime_hash` | `"81.01"` | TH/s instantaneous |
| `average_hash` | `"75.68"` | TH/s avg |
| `accepted` | `"681"` | Accepted shares |
| `reject` | `"1"` | Rejected shares |
| `rejected_percentage` | `"0.15"` | Reject % |
| `fan1`–`fan4` | `"1585"` | RPM per fan |
| `fanr` | `"50"` | Fan duty % |
| `fan_status` | `"0"` | `0` Fine, non-zero Fault |
| `asic_status` | `"0"` | `0` Fine, non-zero Error |
| `ping` | `"28"` | Pool latency ms |
| `power_status` | `"0"` | `0` Fine, non-zero Error |
| `pool_status` | `"1"` | `0` Inactive, `1` Active |
| `current_pool` | `"1"` | Active pool index (1-based) |
| `address` | `"stratum+tcp://..."` | Active pool URL |
| `worker` | `"<bitcoin-address>.avalonq1"` | Active worker name |
| `mac` | `"aa:bb:cc:dd:ee:ff"` | MAC address |
| `version` | `"25052801_14a19a2"` | Firmware version |
| `pool1`/`worker1`/`passwd1` | … | Pool slot 1 (also `pool2`/`pool3` slots) |

The response is JSONP wrapped: strip the `dashboardCallback(` prefix
and the trailing `);` to get parseable JSON.

---

## STATS payload (cgminer `stats`/`estats`)

`STATS[].MM ID0:Summary` is a single string with bracketed key-value
pairs. Parser pattern: `(\w+)\[([^\]]*)\]`. Notable fields on the Q:

| Key | Meaning |
|---|---|
| `Ver` / `LVer` / `BVer` | Firmware versions (logic, boot) |
| `HashMcu0Ver` / `FanMcuVer` | MCU firmware on hashboard / fanboard |
| `CPU` | Main CPU (`K230` on Q) |
| `DNA` | Hardware serial |
| `STATE` | Run state |
| `MEMFREE` | Free RAM (KB) |
| `NETFAIL` | 8 net-failure counters |
| `SYSTEMSTATU` | Human-readable system state |
| `Elapsed` | Uptime (sec) |
| `LW` / `MH` / `DHW` / `HW` | Local-work / megahash / discarded / hardware-error counters |
| `DH` | Hardware-error % |
| `ITemp` | Inlet temp |
| `HBITemp` / `HBOTemp` | Hashboard inlet / outlet temp |
| `TMax` / `TAvg` / `TarT` | Max / avg / target temperature |
| `Fan1`..`Fan4` / `FanR` | Per-fan RPM and duty % |
| `FanErr` | Fan error count |
| `PS` | Power-supply telemetry (7 ints: enabled, vin, vout?, iin?, iout?, vsense?, watts) — exact mapping not confirmed |
| `GHSspd` / `GHSmm` / `GHSavg` | GH/s instantaneous, MM-reported, avg |
| `WU` | Work units / minute |
| `Freq` | Current frequency (MHz) |
| `MGHS` | Per-board hashrate avg |
| `TA` | Total ASIC count |
| `Core` | ASIC core revision (e.g. `A3197S`) |
| `BIN` | Bin (ASIC speed grade) |
| `PING` | Pool RTT ms |
| `WORKMODE` | Current work mode (matches `workingmode` from web) |
| `WORKLEVEL` | Current work level |
| `MPO` | Max power (W) at current mode |
| `PLL0` | Per-PLL counts (4 ints) |
| `SF0` | Per-PLL frequency targets (4 ints) |

`estats` adds an `HBinfo` field: `HB0 { PVT_T0[160 ints], PVT_V0[160 ints], MW0[160 ints] }`
giving per-ASIC temperature, voltage, and megawork counters across all
160 ASICs on the single hashboard.

---

## Sample responses (captured from device)

```jsonc
// {"command":"version"}
{"VERSION":[{
  "CGMiner":"4.11.1","API":"3.7","PROD":"Avalon Q","MODEL":"Q",
  "HWTYPE":"Q_MM1v1_X1","SWTYPE":"MM319",
  "LVERSION":"25052801_14a19a2","BVERSION":"25052801_14a19a2","CGVERSION":"25052801_14a19a2",
  "HBMCUVERSION":"Q_hb_v1.1","FANMCUVERSION":"Q_fb_v1.2",
  "DNA":"<16-hex-serial>","MAC":"aabbccddeeff"
}]}
```

```jsonc
// {"command":"summary"}
{"SUMMARY":[{
  "Elapsed":1873,"MHS av":75774433.33,"MHS 5s":79008182.64,
  "MHS 1m":78165812.87,"MHS 5m":78456318.28,"MHS 15m":68288868.12,
  "Found Blocks":0,"Getworks":179,"Accepted":657,"Rejected":1,
  "Hardware Errors":0,"Utility":21.05,
  "Difficulty Accepted":31513825,"Difficulty Rejected":43785,
  "Best Share":7003239,"Device Hardware%":0,"Device Rejected%":0.1323,
  "Pool Rejected%":0.1387,"Last getwork":0
}]}
```

```jsonc
// {"command":"pools"}
{"POOLS":[{
  "POOL":0,"URL":"stratum+tcp://Parasite.wtf:42069","Status":"Alive","Priority":0,
  "Quota":1,"Getworks":179,"Accepted":657,"Rejected":1,
  "User":"<bitcoin-address>.avalonq1","Password":"x",
  "Last Share Time":1905,"Diff1 Shares":33107968,
  "Difficulty Accepted":31513825,"Last Share Difficulty":58827,
  "Has Stratum":true,"Stratum Active":true,"Stratum URL":"Parasite.wtf",
  "Current Block Height":947614
}]}
```

Hashrate units in `summary`/`devs` are in **MH/s**. The web UI's
`realtime_hash` is in **TH/s**. Convert accordingly when integrating.

---

## Integration notes for paraapp

The app integrates Canaan Avalon via two collaborating modules:

- **`src/api/avalon.ts`** — CGMiner JSON RPC over raw TCP (port 4028)
  using `react-native-tcp-socket`. Handles all reads (version,
  summary, pools, stats, estats), the MM/HBinfo bracket-string
  parsing, and the only working `ascset` write (`reboot,0`). Exports
  `adaptToLocalMiner()` which folds the four read responses into the
  shared `LocalMiner` shape.
- **`src/api/avalonWeb.ts`** — Web CGI fallback (port 80) gated on the
  admin password. Used for **pool config** (cgminer `setpool` is
  unsupported on the Q) and as an optional reboot path on older
  firmware. Auth cookie = `salt + sha256(password).slice(0, 24)`,
  using `js-sha256`.

Discovery (`src/utils/discovery.ts`) probes both port 80 (AxeOS /
Hammer) and port 4028 (Avalon) per IP in parallel via `Promise.any`.
Concurrency was halved from 50 to 30 to keep the in-flight socket
count similar to the previous AxeOS-only path.

Polling guidance: `summary` + `pools` + `stats` is the cheap base; use
`estats` only when the detail screen with the per-ASIC heatmap is
visible — its 160-element PVT arrays are bigger than everything else
combined. Cgminer is single-threaded — serialize requests; do not run
concurrent commands against the same miner.

UI conventions:
- Avalon reports hashrate in MH/s on the wire; the adapter converts
  to GH/s to match `LocalMiner.hashRate`. The fleet card and detail
  screen already auto-scale to TH/s.
- Avalon doesn't expose frequency/voltage *sliders* — it has Eco /
  Standard / Super work modes. The settings UI should render mode
  pills for `minerType === 'avalon'` instead of the AxeOS sliders.
- Four fans → render as a 2×2 grid of RPM tiles. AxeOS still gets the
  single-fan card.
- Per-ASIC PVT temperatures (160 cells) ship as a collapsible heatmap
  in the detail screen. Polling cost: only fetched while expanded.

## Open questions

- Full `workmode` / `worklevel` / `frequency` value formats. We
  confirmed the *option names* are accepted; the value syntax needs
  probing on a non-production unit before we wire writes for them.
- `get_auth.cgi`'s `code` field — never read by the SPA's JS; might be
  a CSRF token used by a settings page we haven't discovered.
- Whether other hidden CGIs exist (firmware update, network config).
- Behavior on other Canaan models (Nano 3S, Mini 3, A-series). The
  HTML branches on `hwtype` so the web layer is shared, but `ascset`
  vocabulary almost certainly differs per model.
