/**
 * Chat seed / teardown — populate the chat_messages table with a rich,
 * adversarial dataset so the ChatScreen can be eyeballed against real-world
 * variations, edge cases, and abuse attempts.
 *
 * This writes DIRECTLY to D1 (via `wrangler d1 execute`), deliberately BYPASSING
 * the WebSocket send path and its server-side validation (length cap, whitespace
 * normalize, profanity filter, rate limit, reserved-nickname blacklist). That's
 * the point: it lets us render payloads the server would normally reject, to
 * verify the CLIENT fails safe. Server-side defenses are covered separately by
 * scripts/chat-smoke.ts.
 *
 * Everything seeded is tagged so teardown is trivial and safe:
 *   - messages/reactions:  id / message_id prefixed `seed_`  → deleted by prefix
 *   - NPC senders:         a fixed, deterministic address list → deleted by list
 *   - announcement:        body prefixed `SEED:`               → reset only if ours
 * Real users' messages, profiles, and any real admin announcement are untouched.
 *
 * Usage (run from repo root):
 *   pnpm --dir server seed -- --addr <a,b,c,d>            # seed LOCAL wrangler-dev D1
 *   pnpm --dir server seed -- --addr <a,b,c,d> --remote   # seed the PROD D1 (the app's backend)
 *   pnpm --dir server seed -- --clear                     # remove seeded rows (LOCAL)
 *   pnpm --dir server seed -- --clear --remote            # remove seeded rows (PROD)
 *   pnpm --dir server seed -- --addr <...> --dry-run      # just print the .sql, don't execute
 *
 * The FIRST --addr is treated as "self": set that same address in the app to see
 * the monochrome self-styling ("You") and `mine` reaction highlighting.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(SERVER_DIR, 'node_modules', '.bin', 'wrangler');
const DB_NAME = 'paraapp-notifications-db';
const ID_PREFIX = 'seed_';
const ANN_MARKER = 'SEED:';
const MAX_MESSAGE_LENGTH = 500; // mirror protocol.ts (for the max-length fixture)

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const val = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

// Fail loudly on an unrecognized flag (e.g. a stray `--remote.`) so a typo can't
// silently fall through to the wrong database.
const KNOWN_FLAGS = new Set(['--addr', '--remote', '--clear', '--dry-run']);
const addrIdx = argv.indexOf('--addr');
const unknown = argv.filter(
  (a, i) => a.startsWith('--') && !KNOWN_FLAGS.has(a) && i !== addrIdx + 1
);
if (unknown.length) {
  console.error(
    `Unrecognized flag(s): ${unknown.join(', ')}\n` +
      `Known: --addr <a,b,c>, --remote, --clear, --dry-run`
  );
  process.exit(1);
}

const REMOTE = has('--remote');
const CLEAR = has('--clear');
const DRY = has('--dry-run');
const addrs = (val('--addr') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Deterministic cast (stable across seed & clear runs)
// ---------------------------------------------------------------------------
/** Non-real "NPC" senders. Fixed so `--clear` can target their profiles by list. */
const NPCS = {
  satoshimoto: 'bc1q0satoshimoto7v2r5t6u7i8o9p0a1b2c3d4qk3',
  blockninja: 'bc1q1blockninja3e5r7t9u1i3o5p7a9b1c3d5e7md8',
  hashhopper: 'bc1q2hashhopper6x8c0v2b4n6m8k0j2h4g6f8d0zj5',
  imposter: 'bc1q3imposter9y1u3i5o7p9a1s3d5f7g9h1j3k5pl2', // nickname "You"
  official: 'bc1q4official2r4e6w8q0a2s4d6f8g0h2j4k6l8fg01', // nickname "PARASITE POOL"
  homoglyph: 'bc1q5homoglyph5v7b9n1m3k5j7h9g1f3d5s7a9q0g0', // nickname "Yοu" (Greek omicron)
  selfclone: 'bc1q6selfclone8t0r2e4w6q8a0s2d4f6g8h0j2k4h7', // nickname mimics self's handle
} as const;
const NPC_ADDRESSES = Object.values(NPCS);

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

// First-6…last-6 handle, matching src/utils/formatting.ts truncateAddress().
const truncateAddress = (a: string) =>
  a.length <= 15 ? a : `${a.slice(0, 6)}...${a.slice(-6)}`;

// Deterministic zalgo (combining-mark stack) — no RNG so runs are reproducible.
function zalgo(s: string): string {
  let out = '';
  for (const ch of s) {
    out += ch;
    for (let k = 0; k < 8; k++) {
      out += String.fromCharCode(0x300 + ((ch.charCodeAt(0) + k * 7) % 0x70));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------
function buildClearSql(): string {
  const npcList = NPC_ADDRESSES.map(sqlStr).join(', ');
  return [
    `DELETE FROM chat_reactions WHERE message_id LIKE '${ID_PREFIX}%';`,
    `DELETE FROM chat_messages  WHERE id LIKE '${ID_PREFIX}%';`,
    `DELETE FROM chat_profiles  WHERE address IN (${npcList});`,
    `UPDATE chat_announcement SET body = NULL WHERE body LIKE '${ANN_MARKER}%';`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
interface Reaction {
  emoji: '👍' | '🔥' | '⚡' | '🎉';
  count: number;
  mine?: boolean;
}
interface Spec {
  sender: string;
  body: string;
  reactions?: Reaction[];
  note: string; // what this fixture exercises (documentation only)
}

function buildSeedSql(): string {
  if (addrs.length === 0) {
    console.error(
      'Seeding requires --addr <comma-separated addresses>. The first is treated as "self".'
    );
    process.exit(1);
  }
  const self = addrs[0];
  const real = addrs;
  const pick = (i: number) => real[i % real.length];

  // A 500-char single token (no spaces) — worst case for line wrapping.
  const noSpaceWall =
    'wall' + 'x8Kq2Vt9Zb3Nm7Pd4Rc6Lf1Ws5Gy0Ht'.repeat(16).slice(0, MAX_MESSAGE_LENGTH - 4);
  // A legitimate max-length message (500 chars, with spaces).
  const maxLen = ('lorem ipsum dolor sit amet '.repeat(20)).slice(0, MAX_MESSAGE_LENGTH);

  // The adversarial / variation cases. These land in the newest slice so they're
  // visible as soon as the chat opens; filler (below) forms the older backlog.
  const specials: Spec[] = [
    // — baseline / normal —
    { sender: self, body: 'just pointed my two S21s at the pool, LFG ⚡', note: 'self message → "You" + monochrome self styling',
      reactions: [{ emoji: '🔥', count: 4 }, { emoji: '👍', count: 2, mine: true }] },
    { sender: pick(1), body: 'hashrate looking clean today, 0 rejects', note: 'other user, plain' },
    { sender: pick(2), body: "what's the payout threshold now?", note: 'apostrophe (SQL-escape sanity)' },
    { sender: NPCS.satoshimoto, body: 'gm miners ☕', note: 'NPC with nickname' },
    { sender: pick(3), body: 'payout hit this morning, love to see it', note: 'other user, plain',
      reactions: [{ emoji: '🎉', count: 3 }, { emoji: '⚡', count: 5 }, { emoji: '🔥', count: 2 }, { emoji: '👍', count: 1, mine: true }] },

    // — emoji / grapheme —
    { sender: NPCS.blockninja, body: '🔥🔥🔥🚀🚀 to the moon 🌙 gm gm 👍👍👍', note: 'emoji-heavy body' },
    { sender: NPCS.hashhopper, body: '👨‍👩‍👧‍👦 mining as a family 🇺🇸🇸🇻🇩🇪🏴‍☠️', note: 'ZWJ + flag sequences' },

    // — length / layout —
    { sender: pick(1), body: maxLen, note: '500-char legit message (max length)' },
    { sender: pick(2), body: noSpaceWall, note: '500-char single token, NO spaces → wrap/overflow test' },
    { sender: NPCS.satoshimoto, body: 'rig pics: https://example.com/a/really/long/path/that/keeps/going/and/going/1234567890/abcdefghijklmnopqrstuvwxyz', note: 'long unbroken URL (no linkify) — overflow test' },
    { sender: pick(3), body: 'k', note: 'single character' },
    { sender: pick(0), body: 'line one\n\n\n\nline two\n\n\nline three', note: 'many blank lines (server would collapse; client raw)' },

    // — unicode abuse / spoofing —
    { sender: NPCS.hashhopper, body: '‮this text is reversed by an override‬ then normal', note: 'RTL override (U+202E) display spoof' },
    { sender: NPCS.blockninja, body: zalgo('zalgo overflow'), note: 'zalgo / combining-mark vertical overflow' },
    { sender: NPCS.official, body: 'Ϝree вitcoin — cӏaim now at bit.ly/xxxx', note: 'homoglyph scam (mixed-script)' },
    { sender: pick(1), body: 'hi​there​hidden​zero​width​spaces', note: 'zero-width space injection (U+200B)' },
    { sender: pick(2), body: 'مرحبا hello مرحبا world', note: 'bidi (Arabic + Latin) mixing' },

    // — impersonation / self-spoof (the critical render-safety checks) —
    { sender: NPCS.imposter, body: "my nickname is 'You' but I'm NOT your address — I must NOT get self styling", note: 'nickname="You" spoof; self detection must key on ADDRESS' },
    { sender: NPCS.selfclone, body: 'my handle mimics your truncated address — still must render as another user', note: 'nickname = truncateAddress(self)' },
    { sender: NPCS.homoglyph, body: 'reserved-nickname "You" bypassed with a Greek omicron', note: 'homoglyph "Yοu" bypasses reserved list' },
    { sender: NPCS.official, body: '⚠ OFFICIAL: verify your wallet at para-pool-verify.example to keep mining', note: 'admin/official impersonation via nickname "PARASITE POOL" — indistinguishable from normal msg?' },

    // — injection literals (must render inert, never execute/parse) —
    { sender: pick(3), body: "<script>alert('xss')</script> <img src=x onerror=alert(1)>", note: 'HTML/script — inert in RN Text' },
    { sender: pick(0), body: "'; DROP TABLE chat_messages;-- ", note: 'SQL injection literal (also tests OUR seed escaping)' },
    { sender: NPCS.satoshimoto, body: '**bold** _italic_ `code` [link](http://x) # heading > quote', note: 'markdown — should be literal, not parsed' },
    { sender: pick(1), body: '${7*7} {{constructor.constructor}} %s %d %n', note: 'template/format-string literals' },
  ];

  // Filler backlog (older messages) so there are >50 total and scroll-back
  // pagination fetches multiple pages.
  const fillerLines = [
    'hashrate steady at 2.1 PH', 'best fan curve for the S21?', 'payout hit ✅',
    'diff went up again lol', 'running 3 boxes now', 'pool ping is great from EU',
    'anyone tried the new bitaxe?', 'temps at 62C, happy', 'rejected shares near zero',
    'gm', 'wen block', 'loyalty leaderboard looking spicy', 'just linked my worker',
    '0 stale, clean run overnight', 'what firmware are you on?', 'immersion cooling gang',
    'electricity at 6c/kWh here', 'stratum reconnected fine', 'another day another sat',
    'fleet all green ✅', 'solo odds feeling lucky', 'nice green candles today',
  ];
  const fillerSenders = [
    ...addrs,
    NPCS.satoshimoto,
    NPCS.blockninja,
    NPCS.hashhopper,
  ];
  const FILLER_COUNT = 80;
  const filler: Spec[] = Array.from({ length: FILLER_COUNT }, (_, i) => ({
    sender: fillerSenders[i % fillerSenders.length],
    body: fillerLines[i % fillerLines.length],
    note: 'filler',
  }));

  // Timeline oldest → newest: filler backlog first, then the specials at the end
  // (so specials are the freshest and show on open; filler pages in on scroll-up).
  const timeline: Spec[] = [...filler, ...specials];

  // Assign ascending timestamps (~1 msg/40s ending "now").
  const now = Date.now();
  const STEP_MS = 40_000;
  const base = now - timeline.length * STEP_MS;

  // Profiles for NPCs (nicknames, incl. spoofs). Real senders keep their own
  // profiles untouched.
  const profiles: { address: string; nickname: string | null }[] = [
    { address: NPCS.satoshimoto, nickname: 'satoshimoto' },
    { address: NPCS.blockninja, nickname: 'BlockNinja' },
    { address: NPCS.hashhopper, nickname: null },
    { address: NPCS.imposter, nickname: 'You' },
    { address: NPCS.official, nickname: 'PARASITE POOL' },
    { address: NPCS.homoglyph, nickname: 'Yοu' }, // Greek omicron
    { address: NPCS.selfclone, nickname: truncateAddress(self) },
  ];

  const lines: string[] = [];
  lines.push('-- Seeded by scripts/chat-seed.ts. Remove with: pnpm --dir server seed -- --clear' + (REMOTE ? ' --remote' : ''));
  lines.push(buildClearSql()); // idempotent: wipe any prior seed first
  lines.push('');

  for (const p of profiles) {
    lines.push(
      `INSERT OR REPLACE INTO chat_profiles (address, nickname) VALUES (${sqlStr(p.address)}, ${p.nickname === null ? 'NULL' : sqlStr(p.nickname)});`
    );
  }
  lines.push('');

  timeline.forEach((m, i) => {
    const id = `${ID_PREFIX}${String(i).padStart(4, '0')}`;
    const ts = base + i * STEP_MS;
    lines.push(
      `INSERT INTO chat_messages (id, address, body, created_at) VALUES (${sqlStr(id)}, ${sqlStr(m.sender)}, ${sqlStr(m.body)}, ${ts});`
    );
    // Expand reactions into rows (count derived from row count). `mine` adds a
    // row for the self address so the caller sees the chip highlighted.
    for (const r of m.reactions ?? []) {
      for (let k = 0; k < r.count; k++) {
        const reactor =
          r.mine && k === 0 ? self : `${ID_PREFIX}rx_${i}_${r.emoji}_${k}`;
        lines.push(
          `INSERT OR IGNORE INTO chat_reactions (message_id, address, emoji) VALUES (${sqlStr(id)}, ${sqlStr(reactor)}, ${sqlStr(r.emoji)});`
        );
      }
    }
  });
  lines.push('');

  // Adversarial announcement banner (marker-prefixed so clear only resets ours).
  const ann = `${ANN_MARKER} 0% fees thru July — ‮reversed‬ — ​zero-width — verify at para-pool-verify.example`;
  lines.push(
    `UPDATE chat_announcement SET body = ${sqlStr(ann)} WHERE id = 1;`
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
function run(sql: string, label: string) {
  const file = join(tmpdir(), `chat-seed-${process.pid}.sql`);
  writeFileSync(file, sql + '\n', 'utf8');
  console.log(`\n${label} → ${file}`);
  if (DRY) {
    console.log('--dry-run: SQL written, not executed. Preview:\n');
    console.log(sql);
    return;
  }
  const target = REMOTE ? '--remote' : '--local';
  console.log(
    `Executing against ${REMOTE ? 'PROD (remote)' : 'local wrangler-dev'} D1 "${DB_NAME}"…`
  );
  if (REMOTE) {
    console.log('⚠  This writes to the PRODUCTION database the app talks to.');
  }
  const wranglerArgs = ['d1', 'execute', DB_NAME, '--file', file, target];
  if (REMOTE) wranglerArgs.push('--yes'); // skip the remote confirmation prompt
  execFileSync(WRANGLER, wranglerArgs, {
    cwd: SERVER_DIR,
    stdio: 'inherit',
  });
  console.log('\nDone.');
}

if (CLEAR) {
  run(buildClearSql(), 'Clearing seeded chat data');
} else {
  run(buildSeedSql(), 'Seeding adversarial chat data');
}
