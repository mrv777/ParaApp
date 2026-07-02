/**
 * Chat backend smoke-test harness.
 *
 * Drives the chat backend exactly like the RN client's networking layer would:
 * REST session/history + a native WebSocket. Runs two simulated clients (A & B)
 * to assert broadcast, presence, rate-limits, blocking, reactions, moderation.
 *
 * Usage:
 *   pnpm smoke --http http://localhost:8787 --ws ws://localhost:8787
 *   pnpm smoke --http https://<worker>.workers.dev --ws wss://<worker>.workers.dev \
 *     --addr-a <btcAddressA> --addr-b <btcAddressB>
 *
 * The scenario suite is filled in per phase (see CHAT_BUILD_PLAN.md). Phase 0
 * ships the runner + arg parsing + a health probe so the wiring is proven first.
 */

interface Args {
  http: string;
  ws: string;
  addrA?: string;
  addrB?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    http: get('--http') ?? 'http://localhost:8787',
    ws: get('--ws') ?? 'ws://localhost:8787',
    addrA: get('--addr-a'),
    addrB: get('--addr-b'),
  };
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`chat-smoke → http=${args.http} ws=${args.ws}`);

  // Health probe (proves the harness ↔ worker wiring before real scenarios).
  try {
    const res = await fetch(`${args.http}/`);
    const body = (await res.json()) as { status?: string };
    check('health endpoint reachable', res.ok && body.status === 'ok', `status=${res.status}`);
  } catch (err) {
    check('health endpoint reachable', false, String(err));
  }

  // Phase 1+ scenarios are appended here:
  //   - session gate (valid address 200, non-pool 403)
  //   - two-client connect → presence == 2
  //   - A msg → B receives; history REST returns it
  //   - rate-limit rejects a burst
  //   - (Phase 3) reaction add/remove aggregation, bad-emoji reject
  //   - (Phase 5) blocked-content reject, blocked-address invisibility

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
