/**
 * Chat backend smoke-test harness.
 *
 * Drives the chat backend exactly like the RN client's networking layer would:
 * REST session/history + a native WebSocket. Runs two simulated clients (A & B)
 * to assert broadcast, presence, rate-limits, and (later phases) blocking,
 * reactions, moderation. Imports the WS protocol types from
 * `../src/chat/protocol` so the test client and server never drift.
 *
 * Usage:
 *   pnpm smoke --http http://localhost:8787 --ws ws://localhost:8787
 *   # Authenticated (posting) scenarios need a real Parasite Pool address:
 *   pnpm smoke --addr-a bc1q...your-payout-address
 */

import WebSocket from 'ws';
import type { ClientEvent, ServerEvent } from '../src/chat/protocol';

interface Args {
  http: string;
  ws: string;
  addrA?: string;
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
  };
}

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function skip(label: string, why: string): void {
  skipped++;
  console.log(`  · ${label} — skipped (${why})`);
}

/** A simulated client: buffers server events and can await one matching a predicate. */
class Client {
  private readonly socket: WebSocket;
  private readonly received: ServerEvent[] = [];
  private readonly waiters: Array<{
    predicate: (e: ServerEvent) => boolean;
    resolve: (e: ServerEvent) => void;
  }> = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(data.toString()) as ServerEvent;
      } catch {
        return;
      }
      this.received.push(event);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i].predicate(event)) {
          this.waiters.splice(i, 1)[0].resolve(event);
        }
      }
    });
  }

  static connect(wsBase: string, token?: string): Promise<Client> {
    const url = `${wsBase}/chat/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const socket = new WebSocket(url);
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(new Client(socket)));
      socket.once('error', reject);
    });
  }

  send(event: ClientEvent): void {
    this.socket.send(JSON.stringify(event));
  }

  waitFor(
    predicate: (e: ServerEvent) => boolean,
    timeoutMs = 3000
  ): Promise<ServerEvent | null> {
    const existing = this.received.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const waiter = { predicate, resolve: (e: ServerEvent) => resolve(e) };
      this.waiters.push(waiter);
      setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
    });
  }

  close(): void {
    this.socket.close();
  }
}

async function postSession(
  http: string,
  btcAddress: string
): Promise<{ status: number; token?: string }> {
  const res = await fetch(`${http}/chat/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ btcAddress }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { token?: string };
  };
  return { status: res.status, token: body.data?.token };
}

interface HistoryMessage {
  id: string;
  body: string;
  reactions?: { emoji: string; count: number; mine?: boolean }[];
}

async function getHistory(
  http: string,
  address?: string
): Promise<HistoryMessage[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (address) params.set('address', address);
  const res = await fetch(`${http}/chat/history?${params.toString()}`);
  const body = (await res.json()) as { data?: { messages?: HistoryMessage[] } };
  return body.data?.messages ?? [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function putNickname(
  http: string,
  token: string,
  nickname: string
): Promise<{ status: number }> {
  const res = await fetch(`${http}/chat/nickname`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, nickname }),
  });
  return { status: res.status };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`chat-smoke → http=${args.http} ws=${args.ws}`);

  // 1. Health probe.
  try {
    const res = await fetch(`${args.http}/`);
    const body = (await res.json()) as { status?: string };
    check('health endpoint reachable', res.ok && body.status === 'ok', `status=${res.status}`);
  } catch (err) {
    check('health endpoint reachable', false, String(err));
  }

  // 2. Session gate rejects a non-pool address.
  const bogus = await postSession(args.http, 'bc1qthis0address0is0not0on0the0pool0xxxx');
  check('session gate rejects non-pool address (403)', bogus.status === 403, `status=${bogus.status}`);

  // 3. Two anonymous read-only clients → presence reflects both.
  let a: Client;
  let b: Client;
  try {
    a = await Client.connect(args.ws);
    b = await Client.connect(args.ws);
    check('two anonymous clients complete WS upgrade', true);
  } catch (err) {
    check('two anonymous clients complete WS upgrade', false, String(err));
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(1);
    return;
  }
  const presence = await b.waitFor((e) => e.type === 'presence' && e.online >= 2);
  check('presence reports >= 2 online', !!presence);

  // 4. Anonymous client cannot post.
  a.send({ type: 'msg', body: 'anon should be rejected' });
  const anonErr = await a.waitFor((e) => e.type === 'error');
  check(
    'anonymous post rejected (not_authenticated)',
    anonErr?.type === 'error' && anonErr.code === 'not_authenticated',
    anonErr?.type === 'error' ? anonErr.code : 'no error received'
  );

  // 5. History endpoint returns a messages array.
  const history = await getHistory(args.http);
  check('history returns a messages array', Array.isArray(history));

  // 6. Authenticated scenarios (need a real pool address).
  if (args.addrA) {
    const session = await postSession(args.http, args.addrA);
    check(
      'session gate accepts valid pool address (token issued)',
      session.status === 200 && !!session.token,
      `status=${session.status}`
    );

    if (session.token) {
      const authed = await Client.connect(args.ws, session.token);
      const body = `smoke ${Date.now()}`;
      authed.send({ type: 'msg', body });

      const broadcast = await b.waitFor((e) => e.type === 'msg' && e.body === body);
      check('authed message broadcasts to other client', !!broadcast);
      const messageId =
        broadcast && broadcast.type === 'msg' ? broadcast.id : null;

      const history2 = await getHistory(args.http);
      check('message persisted to history', history2.some((m) => m.body === body));

      // Rapid burst → rate-limited (min gap 1.5s).
      authed.send({ type: 'msg', body: 'burst-1' });
      authed.send({ type: 'msg', body: 'burst-2' });
      const rateLimited = await authed.waitFor(
        (e) => e.type === 'error' && e.code === 'rate_limited'
      );
      check('rapid posts are rate-limited', !!rateLimited);

      // Reactions (Phase 3).
      if (messageId) {
        authed.send({ type: 'react', messageId, emoji: '🔥', op: 'add' });
        const reactAdd = await b.waitFor(
          (e) =>
            e.type === 'react' &&
            e.messageId === messageId &&
            e.emoji === '🔥' &&
            e.op === 'add'
        );
        check(
          'reaction add broadcasts with count',
          reactAdd?.type === 'react' && reactAdd.count === 1,
          reactAdd?.type === 'react' ? `count=${reactAdd.count}` : 'no react event'
        );

        // Bad emoji rejected (validated before the rate limit, so no gap needed).
        authed.send({ type: 'react', messageId, emoji: '😀', op: 'add' });
        const badEmoji = await authed.waitFor(
          (e) => e.type === 'error' && e.code === 'bad_emoji'
        );
        check('invalid emoji rejected', !!badEmoji);

        // History reflects the reaction with `mine` for the reactor.
        const history3 = await getHistory(args.http, args.addrA);
        const reacted = history3.find((m) => m.id === messageId);
        check(
          'history returns reaction summary with mine=true',
          !!reacted?.reactions?.some(
            (r) => r.emoji === '🔥' && r.count === 1 && r.mine === true
          )
        );

        // Toggle off → count returns to 0.
        await sleep(300); // respect reaction min-gap
        authed.send({ type: 'react', messageId, emoji: '🔥', op: 'remove' });
        const reactRemove = await b.waitFor(
          (e) =>
            e.type === 'react' &&
            e.messageId === messageId &&
            e.emoji === '🔥' &&
            e.op === 'remove'
        );
        check(
          'reaction remove broadcasts count=0',
          reactRemove?.type === 'react' && reactRemove.count === 0
        );
      } else {
        skip('reaction add broadcasts with count', 'no message id');
        skip('invalid emoji rejected', 'no message id');
        skip('history returns reaction summary with mine=true', 'no message id');
        skip('reaction remove broadcasts count=0', 'no message id');
      }

      // Nickname (Phase 4): set → new messages carry it → clear.
      if (session.token) {
        const nick = `Smoke${Date.now() % 10000}`;
        const nickRes = await putNickname(args.http, session.token, nick);
        check('nickname set (200)', nickRes.status === 200, `status=${nickRes.status}`);

        await sleep(1600); // respect the 1.5s message min-gap
        const body2 = `smoke nick ${Date.now()}`;
        authed.send({ type: 'msg', body: body2 });
        const nickBroadcast = await b.waitFor(
          (e) => e.type === 'msg' && e.body === body2
        );
        check(
          'message carries nickname',
          nickBroadcast?.type === 'msg' && nickBroadcast.nickname === nick,
          nickBroadcast?.type === 'msg'
            ? `nickname=${nickBroadcast.nickname}`
            : 'no broadcast'
        );

        await putNickname(args.http, session.token, ''); // clear
      } else {
        skip('nickname set (200)', 'no token');
        skip('message carries nickname', 'no token');
      }

      authed.close();
    }
  } else {
    skip('session gate accepts valid pool address', 'pass --addr-a <pool address>');
    skip('authed message broadcasts to other client', 'pass --addr-a');
    skip('message persisted to history', 'pass --addr-a');
    skip('rapid posts are rate-limited', 'pass --addr-a');
  }

  a.close();
  b.close();

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
