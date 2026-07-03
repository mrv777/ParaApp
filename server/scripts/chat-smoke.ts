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
  adminSecret?: string;
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
    adminSecret: get('--admin-secret'),
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

  /** Send a raw frame — for malformed-input tests the typed `send` can't express. */
  sendRaw(data: string): void {
    this.socket.send(data);
  }

  /** Whether the underlying socket is still open (survived the last frame). */
  isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
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
  replyToId?: string;
  replyTo?: { senderDisplay: string; textPreview: string };
}

async function getHistory(
  http: string,
  token?: string
): Promise<HistoryMessage[]> {
  const params = new URLSearchParams({ limit: '50' });
  // Session token (not a bare address) unlocks block filtering + `mine` flags.
  if (token) params.set('token', token);
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

async function jsonPost(
  http: string,
  path: string,
  body: unknown,
  method = 'POST'
): Promise<{ status: number }> {
  const res = await fetch(`${http}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

      // Malformed input: a non-string body ({"type":"msg","body":42}) must be
      // rejected with `bad_body`, not throw out of the DO's message handler.
      // The guard runs before the rate-limit check, so this consumes no budget
      // and persists nothing. Getting a response back proves the socket lived.
      authed.sendRaw(JSON.stringify({ type: 'msg', body: 42 }));
      const badBody = await authed.waitFor(
        (e) => e.type === 'error' && e.code === 'bad_body'
      );
      check(
        'non-string message body rejected (bad_body)',
        badBody?.type === 'error' && badBody.code === 'bad_body',
        badBody?.type === 'error' ? badBody.code : 'no error received'
      );
      check('socket survives non-string body', authed.isOpen());

      // Rapid burst → rate-limited (min gap 1.5s).
      authed.send({ type: 'msg', body: 'burst-1' });
      authed.send({ type: 'msg', body: 'burst-2' });
      const rateLimited = await authed.waitFor(
        (e) => e.type === 'error' && e.code === 'rate_limited'
      );
      check('rapid posts are rate-limited', !!rateLimited);

      // Reactions (Phase 3).
      if (messageId) {
        // Same-address multi-device sync (PR3 review finding #2): the actor's
        // *other* device only ever sees the count-only coalesced broadcast and
        // would keep a stale `mine`. It must receive a targeted echo carrying
        // actor+op. Connect a sibling on the SAME token (= same address) and
        // assert it gets that echo. `b` (anonymous, different address) must not.
        const sibling = await Client.connect(args.ws, session.token);
        authed.send({ type: 'react', messageId, emoji: '🔥', op: 'add' });
        const siblingEcho = await sibling.waitFor(
          (e) =>
            e.type === 'react' &&
            e.messageId === messageId &&
            e.emoji === '🔥' &&
            e.actor != null
        );
        check(
          'same-address sibling receives targeted react echo (actor+op)',
          siblingEcho?.type === 'react' &&
            siblingEcho.op === 'add' &&
            siblingEcho.count === 1,
          siblingEcho?.type === 'react'
            ? `op=${siblingEcho.op} count=${siblingEcho.count}`
            : 'no echo received'
        );
        sibling.close();

        // Reaction broadcasts are coalesced to a count-only event (no actor/op),
        // trailing the send by ~150ms — match on the authoritative count.
        const reactAdd = await b.waitFor(
          (e) =>
            e.type === 'react' &&
            e.messageId === messageId &&
            e.emoji === '🔥' &&
            e.count === 1
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
        const history3 = await getHistory(args.http, session.token);
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
            e.count === 0
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

        // Reserved/impersonation nicknames rejected (normalized match).
        const reserved = await putNickname(args.http, session.token, 'Adm1n');
        check(
          'reserved nickname rejected (400)',
          reserved.status === 400,
          `status=${reserved.status}`
        );

        // Homoglyph bypass: "Yοu" uses a Greek omicron — must still be caught.
        const homoglyph = await putNickname(args.http, session.token, 'Yοu');
        check(
          'homoglyph reserved nickname rejected (400)',
          homoglyph.status === 400,
          `status=${homoglyph.status}`
        );

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

      // Replies: a message can reference a parent; the broadcast + history carry
      // replyToId and a hydrated quote. The first broadcast message is the parent.
      let replyMessageId: string | null = null;
      if (messageId) {
        await sleep(1600);
        const replyBody = `smoke reply ${Date.now()}`;
        authed.send({ type: 'msg', body: replyBody, replyToId: messageId });
        const replyBroadcast = await b.waitFor(
          (e) => e.type === 'msg' && e.body === replyBody
        );
        check(
          'reply broadcasts with replyToId + hydrated quote',
          replyBroadcast?.type === 'msg' &&
            replyBroadcast.replyToId === messageId &&
            !!replyBroadcast.replyTo &&
            replyBroadcast.replyTo.textPreview === body,
          replyBroadcast?.type === 'msg'
            ? `replyToId=${replyBroadcast.replyToId} preview=${JSON.stringify(
                replyBroadcast.replyTo?.textPreview
              )}`
            : 'no broadcast'
        );
        replyMessageId = replyBroadcast?.type === 'msg' ? replyBroadcast.id : null;

        const histReply = await getHistory(args.http, session.token);
        const storedReply = histReply.find((m) => m.id === replyMessageId);
        check(
          'history carries reply quote',
          !!storedReply &&
            storedReply.replyToId === messageId &&
            storedReply.replyTo?.textPreview === body,
          storedReply ? `replyToId=${storedReply.replyToId}` : 'reply not in history'
        );

        // Reply to a nonexistent parent → posts as a plain message, reference
        // silently dropped (a vanished target must never block posting).
        await sleep(1600);
        const orphanBody = `smoke orphan ${Date.now()}`;
        authed.send({
          type: 'msg',
          body: orphanBody,
          replyToId: '00000000-0000-4000-8000-000000000000',
        });
        const orphanBroadcast = await b.waitFor(
          (e) => e.type === 'msg' && e.body === orphanBody
        );
        check(
          'reply to missing parent drops the reference',
          orphanBroadcast?.type === 'msg' &&
            orphanBroadcast.replyToId === undefined &&
            orphanBroadcast.replyTo === undefined,
          orphanBroadcast?.type === 'msg'
            ? `replyToId=${orphanBroadcast.replyToId}`
            : 'no broadcast'
        );

        // Non-UUID replyToId (raw frame) → ignored, message still posts, socket
        // survives (never reaches a D1 lookup).
        await sleep(1600);
        const badRefBody = `smoke badref ${Date.now()}`;
        authed.sendRaw(
          JSON.stringify({ type: 'msg', body: badRefBody, replyToId: 12345 })
        );
        const badRefBroadcast = await b.waitFor(
          (e) => e.type === 'msg' && e.body === badRefBody
        );
        check(
          'non-UUID replyToId ignored (posts as plain)',
          badRefBroadcast?.type === 'msg' &&
            badRefBroadcast.replyToId === undefined
        );
        check('socket survives bad replyToId', authed.isOpen());
      } else {
        skip('reply broadcasts with replyToId + hydrated quote', 'no message id');
        skip('history carries reply quote', 'no message id');
        skip('reply to missing parent drops the reference', 'no message id');
        skip('non-UUID replyToId ignored (posts as plain)', 'no message id');
        skip('socket survives bad replyToId', 'no message id');
      }

      // Whitespace normalization: runs of blank lines collapse to one newline.
      await sleep(1600);
      authed.send({ type: 'msg', body: 'smoke A\n\n\n\n\nB' });
      const nlBroadcast = await b.waitFor(
        (e) => e.type === 'msg' && e.body.startsWith('smoke A') && e.body.includes('B')
      );
      check(
        'excess line breaks collapsed',
        nlBroadcast?.type === 'msg' && nlBroadcast.body === 'smoke A\nB',
        nlBroadcast?.type === 'msg' ? JSON.stringify(nlBroadcast.body) : 'no broadcast'
      );

      // Unicode sanitize: bidi override (U+202E) + zero-width (U+200B) stripped.
      await sleep(1600);
      authed.send({ type: 'msg', body: 'inv‮test​42' });
      const invBroadcast = await b.waitFor(
        (e) => e.type === 'msg' && e.body.startsWith('inv') && e.body.includes('test')
      );
      check(
        'bidi + zero-width chars stripped',
        invBroadcast?.type === 'msg' && invBroadcast.body === 'invtest42',
        invBroadcast?.type === 'msg' ? JSON.stringify(invBroadcast.body) : 'no broadcast'
      );

      // Unicode sanitize: zalgo combining-mark stack capped at two per cluster.
      await sleep(1600);
      authed.send({ type: 'msg', body: 'zal' + '̀'.repeat(8) });
      const zalgoBroadcast = await b.waitFor(
        (e) => e.type === 'msg' && e.body.startsWith('zal')
      );
      check(
        'zalgo combining marks capped',
        zalgoBroadcast?.type === 'msg' && zalgoBroadcast.body === 'zal' + '̀'.repeat(2),
        zalgoBroadcast?.type === 'msg'
          ? `${[...(zalgoBroadcast.body as string)].length} chars`
          : 'no broadcast'
      );

      // Moderation (Phase 5): profane message rejected inline.
      await sleep(1600); // respect message min-gap
      authed.send({ type: 'msg', body: 'fuck this test' });
      const modErr = await authed.waitFor(
        (e) => e.type === 'error' && e.code === 'blocked_content'
      );
      check('profane message blocked (blocked_content)', !!modErr);

      // Report (Phase 5): queues without error.
      if (session.token && messageId) {
        const rep = await jsonPost(args.http, '/chat/report', {
          token: session.token,
          messageId,
          reason: 'smoke',
        });
        check('report accepted (200)', rep.status === 200, `status=${rep.status}`);
      } else {
        skip('report accepted (200)', 'no message id');
      }

      // Block (Phase 5, server-enforced): self-block via one of our own message
      // ids (blocking is keyed by messageId — clients never see full addresses),
      // reconnect to reload the block list, then verify the sender's own new
      // socket is filtered out while a non-blocker still receives the message.
      if (session.token && messageId) {
        const blk = await jsonPost(args.http, '/chat/block', {
          token: session.token,
          messageId,
        });
        check('block accepted (200)', blk.status === 200, `status=${blk.status}`);

        const blockedClient = await Client.connect(args.ws, session.token);
        await sleep(1600);
        const blockedBody = `smoke blocked ${Date.now()}`;
        blockedClient.send({ type: 'msg', body: blockedBody });

        const otherGot = await b.waitFor(
          (e) => e.type === 'msg' && e.body === blockedBody
        );
        check('blocked sender still reaches non-blockers', !!otherGot);

        const selfGot = await blockedClient.waitFor(
          (e) => e.type === 'msg' && e.body === blockedBody,
          1500
        );
        check('blocker does not receive blocked-sender messages', !selfGot);

        const histBlocked = await getHistory(args.http, session.token);
        check(
          'history excludes blocked-sender messages',
          !histBlocked.some((m) => m.body === blockedBody)
        );

        await jsonPost(
          args.http,
          '/chat/block',
          { token: session.token, messageId },
          'DELETE'
        );
        blockedClient.close();
      } else {
        skip('block accepted (200)', 'no token');
        skip('blocked sender still reaches non-blockers', 'no token');
        skip('blocker does not receive blocked-sender messages', 'no token');
        skip('history excludes blocked-sender messages', 'no token');
      }

      // Admin (Phase 5): guard + a couple of actions (dev secret only).
      const noAuth = await fetch(`${args.http}/chat/admin/reports`);
      check('admin API rejects missing secret (401)', noAuth.status === 401);
      if (args.adminSecret) {
        const withAuth = await fetch(`${args.http}/chat/admin/reports`, {
          headers: { 'X-Admin-Secret': args.adminSecret },
        });
        check('admin reports load with secret (200)', withAuth.status === 200);
        if (messageId) {
          const del = await fetch(
            `${args.http}/chat/admin/message/${encodeURIComponent(messageId)}`,
            { method: 'DELETE', headers: { 'X-Admin-Secret': args.adminSecret } }
          );
          check('admin soft-delete message (200)', del.status === 200);
          // The delete must reach live sockets so it disappears without a reload.
          const delBroadcast = await b.waitFor(
            (e) => e.type === 'delete' && e.id === messageId
          );
          check('delete broadcasts to clients', !!delBroadcast);

          // A reply whose parent was just deleted keeps replyToId but loses the
          // quote on the next read → the client shows the "unavailable"
          // placeholder (messageId was the parent of replyMessageId).
          if (replyMessageId) {
            const histAfterDel = await getHistory(args.http, session.token);
            const orphanedReply = histAfterDel.find(
              (m) => m.id === replyMessageId
            );
            check(
              'reply to a deleted parent keeps replyToId, drops the quote',
              !!orphanedReply &&
                orphanedReply.replyToId === messageId &&
                orphanedReply.replyTo === undefined,
              orphanedReply
                ? `replyToId=${orphanedReply.replyToId} replyTo=${JSON.stringify(
                    orphanedReply.replyTo
                  )}`
                : 'reply not in history'
            );
          } else {
            skip(
              'reply to a deleted parent keeps replyToId, drops the quote',
              'no reply id'
            );
          }
        } else {
          skip('admin soft-delete message (200)', 'no message id');
          skip('delete broadcasts to clients', 'no message id');
        }

        // Announcement banner: set → broadcast + history; clear → broadcast null.
        const annText = `smoke announce ${Date.now()}`;
        const setAnn = await fetch(`${args.http}/chat/admin/announcement`, {
          method: 'POST',
          headers: {
            'X-Admin-Secret': args.adminSecret,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ body: annText }),
        });
        check('announcement set (200)', setAnn.status === 200);

        const annBroadcast = await b.waitFor(
          (e) => e.type === 'announcement' && e.body === annText
        );
        check('announcement broadcasts to clients', !!annBroadcast);

        const histRes = await fetch(`${args.http}/chat/history?limit=1`);
        const histJson = (await histRes.json()) as {
          data?: { announcement?: string | null };
        };
        check(
          'history includes announcement',
          histJson.data?.announcement === annText
        );

        await fetch(`${args.http}/chat/admin/announcement`, {
          method: 'DELETE',
          headers: { 'X-Admin-Secret': args.adminSecret },
        });
        const annCleared = await b.waitFor(
          (e) => e.type === 'announcement' && e.body === null
        );
        check('announcement clear broadcasts null', !!annCleared);
      } else {
        skip('admin reports load with secret (200)', 'pass --admin-secret');
        skip('admin soft-delete message (200)', 'pass --admin-secret');
        skip('announcement set (200)', 'pass --admin-secret');
        skip('announcement broadcasts to clients', 'pass --admin-secret');
        skip('history includes announcement', 'pass --admin-secret');
        skip('announcement clear broadcasts null', 'pass --admin-secret');
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
