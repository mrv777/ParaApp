import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../test-utils/sqlite';
import worker from '../index';
import type { Env } from '../types';
import { ChatRoom } from './room';
import { issueSessionToken } from './identity';
import { deleteAllFromAddress, getRecentMessages, pruneChatMessages, softDeleteMessage } from './db';

const author = 'bc1qauthor000000000000000000000000000';
const viewer = 'bc1qviewer000000000000000000000000000';
const original = 'Hallo Miner, bereit zum Mining?';
const english = 'Hello miners, ready for mining?';

describe('shared English translation delivery', () => {
  let database: ReturnType<typeof createTestDatabase>;
  let env: Env;

  beforeEach(() => {
    database = createTestDatabase();
    env = {
      DB: database.db,
      SESSION_SECRET: 'test-session-secret',
      CHAT_TRANSLATION_ENABLED: 'on',
      CHAT_TRANSLATION_MONTHLY_LIMIT: '500',
      GOOGLE_TRANSLATE_API_KEY: 'test-only-google-key',
    } as Env;
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    database.sqlite.close();
  });

  function socket(address: string, blocked: string[] = []) {
    return {
      send: vi.fn(),
      close: vi.fn(),
      deserializeAttachment: () => ({ address, blocked }),
    };
  }

  function events(ws: ReturnType<typeof socket>) {
    return ws.send.mock.calls.map(([payload]) => JSON.parse(payload));
  }

  function roomWithSockets() {
    const sender = socket(author);
    const reader = socket('');
    const blocker = socket(viewer, [author]);
    const background: Promise<unknown>[] = [];
    const room = new ChatRoom({
      setWebSocketAutoResponse: vi.fn(),
      getWebSockets: () => [sender, reader, blocker],
      waitUntil: (task: Promise<unknown>) => background.push(task),
    } as unknown as DurableObjectState, env);
    return { room, sender, reader, blocker, background };
  }

  function holdTranslation() {
    let complete!: (value: Response) => void;
    const held = new Promise<Response>((resolve) => { complete = resolve; });
    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { detections: [[{ language: 'de' }]] } }))
      .mockReturnValueOnce(held);
    vi.stubGlobal('fetch', provider);
    return { provider, complete: () => complete(Response.json({ data: { translations: [{ translatedText: english }] } })) };
  }

  it('delivers originals before the provider completes and filters both events for blocked readers', async () => {
    const { room, sender, reader, blocker, background } = roomWithSockets();
    const { provider, complete } = holdTranslation();
    await room.webSocketMessage(sender as unknown as WebSocket, JSON.stringify({ type: 'msg', body: original }));

    expect(events(reader)).toMatchObject([{ type: 'msg', body: original }]);
    expect(events(blocker)).toEqual([]);
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(2));
    expect(events(reader).some((event) => event.type === 'translation')).toBe(false);
    complete();
    await Promise.all(background);

    const message = events(reader).find((event) => event.type === 'msg');
    expect(events(reader)).toContainEqual({
      type: 'translation', id: message.id,
      englishTranslation: { text: english, sourceLanguage: 'de' },
    });
    expect(events(blocker).filter((event) => event.type === 'msg' || event.type === 'translation')).toEqual([]);
    expect(database.sqlite.prepare('SELECT body FROM chat_messages WHERE id = ?').get(message.id)?.body).toBe(original);
    const history = await getRecentMessages(env.DB, { limit: 50 });
    expect(history[0]).toMatchObject({ body: original, englishTranslation: { text: english, sourceLanguage: 'de' } });
  });

  it('does not publish or store a derivative when its original is deleted during translation', async () => {
    const { room, sender, reader, background } = roomWithSockets();
    const { provider, complete } = holdTranslation();
    await room.webSocketMessage(sender as unknown as WebSocket, JSON.stringify({ type: 'msg', body: original }));
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(2));
    const id = events(reader).find((event) => event.type === 'msg').id;
    await softDeleteMessage(env.DB, id);
    complete();
    await Promise.all(background);
    expect(events(reader).some((event) => event.type === 'translation')).toBe(false);
    expect(database.sqlite.prepare('SELECT * FROM chat_translations WHERE message_id = ?').get(id)).toBeUndefined();
    expect(await getRecentMessages(env.DB, { limit: 50 })).toEqual([]);
  });

  function insert(id: string, address = author, ts = Date.now()) {
    database.sqlite.prepare('INSERT INTO chat_messages (id, address, body, created_at) VALUES (?, ?, ?, ?)').run(id, address, original, ts);
    database.sqlite.prepare("INSERT INTO chat_translations (message_id, status, source_language, text, created_at, updated_at) VALUES (?, 'translated', 'de', ?, ?, ?)").run(id, english, ts, ts);
  }

  it('history serves the shared derivative only with a visible original, including read-only viewers', async () => {
    insert('visible');
    const open = await worker.fetch(new Request('https://worker.test/chat/history'), env, {} as never);
    expect(open.status).toBe(200);
    expect(await open.json()).toMatchObject({ data: {
      messages: [{ body: original, englishTranslation: { text: english, sourceLanguage: 'de' } }],
      translationStatus: { enabled: true, monthlyLimit: 500, used: 0 },
    } });
    database.sqlite.prepare('INSERT INTO chat_blocks (blocker, blocked) VALUES (?, ?)').run(viewer, author);
    const token = await issueSessionToken(viewer, env.SESSION_SECRET);
    const blocked = await worker.fetch(new Request(`https://worker.test/chat/history?token=${token}`), env, {} as never);
    expect(await blocked.json()).toMatchObject({ data: { messages: [] } });
  });

  it('removes derivatives on ban-purge and normal retention without refunding allowance', async () => {
    insert('purge');
    insert('old', viewer, 1);
    database.sqlite.prepare("INSERT INTO chat_translation_usage (month, translation_attempts) VALUES ('2026-10', 2)").run();
    expect(await deleteAllFromAddress(env.DB, author)).toEqual(['purge']);
    expect(database.sqlite.prepare("SELECT * FROM chat_translations WHERE message_id = 'purge'").get()).toBeUndefined();
    expect(await pruneChatMessages(env.DB, 2)).toBe(1);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM chat_translations').get()?.n).toBe(0);
    expect(database.sqlite.prepare("SELECT translation_attempts FROM chat_translation_usage WHERE month = '2026-10'").get()?.translation_attempts).toBe(2);
  });
});
