import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../test-utils/sqlite';
import {
  getTranslationStatus,
  pruneChatTranslations,
  translateChatMessage,
  type TranslationEnv,
} from './translation';

const NOW = Date.UTC(2026, 9, 31, 12);
const MONTH = '2026-10';
const databases: ReturnType<typeof createTestDatabase>[] = [];

function setup(overrides: Partial<TranslationEnv> = {}) {
  const database = createTestDatabase();
  databases.push(database);
  database.sqlite.exec(readFileSync(
    new NodeURL('../../migrations/0015_chat_translations.sql', import.meta.url), 'utf8'
  ));
  const env: TranslationEnv = {
    DB: database.db,
    CHAT_TRANSLATION_ENABLED: 'on',
    GOOGLE_TRANSLATE_API_KEY: 'test-key-never-sent',
    ...overrides,
  };
  const add = (id: string, body = 'Guten Morgen', address = 'sender') => {
    database.sqlite.prepare(
      'INSERT INTO chat_messages (id, address, body, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, address, body, NOW);
    return { id, body, address };
  };
  const usage = (month = MONTH) => database.sqlite.prepare(
    'SELECT * FROM chat_translation_usage WHERE month = ?'
  ).get(month);
  const seedUsage = (attempts: number, detection = 0, translation = 0) => {
    database.sqlite.prepare(
      `INSERT INTO chat_translation_usage
       (month, translation_attempts, detection_characters, translation_characters)
       VALUES (?, ?, ?, ?)`
    ).run(MONTH, attempts, detection, translation);
  };
  const row = (id: string) => database.sqlite.prepare(
    'SELECT * FROM chat_translations WHERE message_id = ?'
  ).get(id);
  return { ...database, env, add, usage, seedUsage, row };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function provider(language = 'de', output = 'Good morning') {
  return vi.fn(async (input: unknown) => String(input).endsWith('/detect')
    ? json({ data: { detections: [[{ language, confidence: 0.1, isReliable: false }]] } })
    : json({ data: { translations: [{ translatedText: output }] } }));
}

function dependencies(requestFetch: ReturnType<typeof provider>, now = () => NOW) {
  return { fetch: requestFetch as unknown as typeof fetch, now };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.sqlite.close();
});

describe('English-only chat translation', () => {
  it('requires explicit enablement and a server-held key; disabled work makes no calls or claims', async () => {
    for (const overrides of [
      { CHAT_TRANSLATION_ENABLED: undefined },
      { CHAT_TRANSLATION_ENABLED: 'off' },
      { GOOGLE_TRANSLATE_API_KEY: '' },
      { CHAT_TRANSLATION_MONTHLY_LIMIT: '0' },
    ]) {
      const { env, add, row } = setup(overrides);
      const requestFetch = provider();
      expect(await translateChatMessage(env, add('disabled'), dependencies(requestFetch))).toBeNull();
      expect(requestFetch).not.toHaveBeenCalled();
      expect(row('disabled')).toBeUndefined();
    }
  });

  it('stores an English translation, uses text format, and puts the API key only in its header', async () => {
    const { env, add, usage, row } = setup();
    const message = add('translated');
    const requestFetch = provider();
    expect(await translateChatMessage(env, message, dependencies(requestFetch)))
      .toEqual({ text: 'Good morning', sourceLanguage: 'de' });
    expect(row(message.id)).toMatchObject({ status: 'translated', text: 'Good morning', source_language: 'de' });
    expect(usage()).toMatchObject({ translation_attempts: 1, detection_characters: message.body.length, translation_characters: message.body.length });
    const [url, init] = requestFetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://translation.googleapis.com/language/translate/v2');
    expect(url).not.toContain('test-key');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-key-never-sent' });
    expect(JSON.parse(String(init.body))).toMatchObject({ source: 'de', target: 'en', format: 'text', model: 'nmt' });
    expect(init.signal).toBeDefined();
  });

  it('charges only detection characters for English and ignores deprecated confidence values', async () => {
    const { env, add, usage, row } = setup();
    const message = add('english', 'Good morning');
    const requestFetch = provider('en');
    expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
    expect(requestFetch).toHaveBeenCalledTimes(1);
    expect(usage()).toMatchObject({ translation_attempts: 0, detection_characters: message.body.length, translation_characters: 0 });
    expect(row(message.id)).toMatchObject({ status: 'english', source_language: 'en', text: null });
  });

  it('claims a message once across concurrent jobs and subsequent retries', async () => {
    const { env, add, usage } = setup();
    const message = add('unique');
    const requestFetch = provider();
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      translateChatMessage(env, message, dependencies(requestFetch))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
    expect(requestFetch).toHaveBeenCalledTimes(2);
    expect(usage()).toMatchObject({ translation_attempts: 1 });
  });

  it('atomically allows only the final non-English attempt under concurrent jobs', async () => {
    const { env, add, seedUsage, usage } = setup({ CHAT_TRANSLATION_MONTHLY_LIMIT: '9000' });
    seedUsage(499);
    const requestFetch = provider();
    const messages = Array.from({ length: 12 }, (_, i) => add(`race-${i}`));
    const results = await Promise.all(messages.map((message) =>
      translateChatMessage(env, message, dependencies(requestFetch))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(usage()).toMatchObject({ translation_attempts: 500 });
    const before = requestFetch.mock.calls.length;
    await translateChatMessage(env, add('after-cap'), dependencies(requestFetch));
    expect(requestFetch).toHaveBeenCalledTimes(before);
    expect(await getTranslationStatus(env, NOW)).toMatchObject({ used: 500, monthlyLimit: 500, limitReached: true });
  });

  it('honors a lower monthly limit without charging English messages as attempts', async () => {
    const { env, add, usage } = setup({ CHAT_TRANSLATION_MONTHLY_LIMIT: '1' });
    const english = provider('en');
    await translateChatMessage(env, add('english-first', 'hello'), dependencies(english));
    const german = provider();
    await translateChatMessage(env, add('german-first'), dependencies(german));
    await translateChatMessage(env, add('german-second'), dependencies(german));
    expect(german).toHaveBeenCalledTimes(2);
    expect(usage()).toMatchObject({ translation_attempts: 1 });
  });

  it('atomically enforces detection character headroom and reports exhaustion', async () => {
    const { env, add, seedUsage, usage } = setup();
    seedUsage(0, 249_500);
    const requestFetch = provider();
    await Promise.all(Array.from({ length: 4 }, (_, i) =>
      translateChatMessage(env, add(`detection-budget-${i}`, 'a'.repeat(500)), dependencies(requestFetch))));
    expect(requestFetch).toHaveBeenCalledTimes(2);
    expect(usage()).toMatchObject({ detection_characters: 250_000, translation_attempts: 1 });
    expect(await getTranslationStatus(env, NOW)).toMatchObject({ limitReached: true });
  });

  it('enforces translation character headroom before a provider translation request', async () => {
    const { env, add, seedUsage, usage } = setup();
    seedUsage(0, 0, 249_500);
    const requestFetch = provider();
    await Promise.all(Array.from({ length: 4 }, (_, i) =>
      translateChatMessage(env, add(`translation-budget-${i}`, 'a'.repeat(500)), dependencies(requestFetch))));
    expect(usage()).toMatchObject({ translation_characters: 250_000, translation_attempts: 1 });
    expect(requestFetch.mock.calls.filter(([input]) => !String(input).endsWith('/detect'))).toHaveLength(1);
    expect(await getTranslationStatus(env, NOW)).toMatchObject({ limitReached: true });
  });

  it('keeps detection reservations after network failures and never retries the same message', async () => {
    const { env, add, usage, row } = setup();
    const message = add('detect-failure');
    const requestFetch = vi.fn(async () => { throw new Error('timeout'); });
    const deps = { fetch: requestFetch as unknown as typeof fetch, now: () => NOW };
    expect(await translateChatMessage(env, message, deps)).toBeNull();
    expect(await translateChatMessage(env, message, deps)).toBeNull();
    expect(requestFetch).toHaveBeenCalledTimes(1);
    expect(usage()).toMatchObject({ detection_characters: message.body.length, translation_attempts: 0, translation_characters: 0 });
    expect(row(message.id)).toMatchObject({ status: 'failed' });
  });

  it('keeps translation attempts and characters after provider failures', async () => {
    const { env, add, usage, row } = setup();
    const message = add('translate-failure');
    const requestFetch = provider();
    requestFetch.mockImplementationOnce(async () => json({ data: { detections: [[{ language: 'de' }]] } }))
      .mockImplementationOnce(async () => { throw new Error('timeout'); });
    expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
    expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
    expect(requestFetch).toHaveBeenCalledTimes(2);
    expect(usage()).toMatchObject({ translation_attempts: 1, detection_characters: message.body.length, translation_characters: message.body.length });
    expect(row(message.id)).toMatchObject({ status: 'failed', text: null });
  });

  it('rejects undetermined or malformed detection without spending translation attempts', async () => {
    for (const language of ['und', 'invalid-language-code', '', undefined]) {
      const { env, add, usage } = setup();
      const message = add('invalid');
      const requestFetch = provider(language);
      if (language === undefined) requestFetch.mockImplementation(async () => json({ data: {} }));
      expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
      expect(requestFetch).toHaveBeenCalledTimes(1);
      expect(usage()).toMatchObject({ translation_attempts: 0 });
    }
  });

  it('makes no provider calls for numeric/emoji-only content and bare identifiers', async () => {
    const { env, add } = setup();
    const requestFetch = provider();
    for (const [i, body] of ['🎉 ⚡ 42!!', 'https://example.com/a?q=1', 'bc1q' + 'a'.repeat(40)].entries()) {
      expect(await translateChatMessage(env, add(`neutral-${i}`, body), dependencies(requestFetch))).toBeNull();
    }
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it('requires a matching canonical message and sender', async () => {
    const { env, add, sqlite } = setup();
    const message = add('canonical');
    sqlite.prepare('UPDATE chat_messages SET deleted = 1 WHERE id = ?').run(message.id);
    const requestFetch = provider();
    for (const input of [message, { id: 'missing', body: 'Hallo' }, { ...add('wrong-body'), body: 'other' }, { ...add('wrong-sender'), address: 'other' }]) {
      expect(await translateChatMessage(env, input, dependencies(requestFetch))).toBeNull();
    }
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it('does not save or return translation text after the original is deleted during translation', async () => {
    const { env, add, sqlite, row } = setup();
    const message = add('deleted-during-request');
    const requestFetch = provider();
    requestFetch.mockImplementationOnce(async () => json({ data: { detections: [[{ language: 'de' }]] } }))
      .mockImplementationOnce(async () => {
        sqlite.prepare('UPDATE chat_messages SET deleted = 1 WHERE id = ?').run(message.id);
        return json({ data: { translations: [{ translatedText: 'Do not publish this' }] } });
      });
    expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
    expect(row(message.id)).toMatchObject({ status: 'skipped', text: null });
  });

  it('does not translate after deletion during detection', async () => {
    const { env, add, sqlite, usage } = setup();
    const message = add('deleted-detect');
    const requestFetch = provider();
    requestFetch.mockImplementation(async () => {
      sqlite.prepare('DELETE FROM chat_messages WHERE id = ?').run(message.id);
      return json({ data: { detections: [[{ language: 'de' }]] } });
    });
    expect(await translateChatMessage(env, message, dependencies(requestFetch))).toBeNull();
    expect(requestFetch).toHaveBeenCalledTimes(1);
    expect(usage()).toMatchObject({ translation_attempts: 0 });
  });

  it('decodes entities once, strips invisible controls, and preserves exact URLs and wallet identifiers', async () => {
    const { env, add } = setup();
    const wallet = 'bc1q' + 'a'.repeat(40);
    const url = 'https://example.com/?a=1&b=2';
    const message = add('identifiers', `Siehe ${wallet} ${url}`);
    const output = `\u202eSee ${wallet} https://example.com/?a=1&amp;b=2 &quot;hi&quot; &#39;x&#39;`;
    expect(await translateChatMessage(env, message, dependencies(provider('de', output))))
      .toEqual({ sourceLanguage: 'de', text: `See ${wallet} ${url} "hi" 'x'` });
    expect(await translateChatMessage(env, add('corrupt-url', 'Siehe https://example.com'), dependencies(provider('de', 'See https://wrong.com')))).toBeNull();
  });

  it('rejects empty, malformed, and oversized translation output', async () => {
    for (const output of ['', 'x'.repeat(2001)]) {
      const { env, add, row, usage } = setup();
      expect(await translateChatMessage(env, add('bad-output'), dependencies(provider('de', output)))).toBeNull();
      expect(row('bad-output')).toMatchObject({ status: 'failed', text: null });
      expect(usage()).toMatchObject({ translation_attempts: 1 });
    }
  });

  it('reserves each provider request in its UTC month when detection crosses month end', async () => {
    const { env, add, usage } = setup();
    let now = Date.UTC(2026, 9, 31, 23, 59, 59);
    const requestFetch = provider();
    requestFetch.mockImplementationOnce(async () => {
      now = Date.UTC(2026, 10, 1);
      return json({ data: { detections: [[{ language: 'de' }]] } });
    });
    const message = add('rollover');
    expect(await translateChatMessage(env, message, dependencies(requestFetch, () => now))).not.toBeNull();
    expect(usage('2026-10')).toMatchObject({ detection_characters: message.body.length, translation_attempts: 0 });
    expect(usage('2026-11')).toMatchObject({ detection_characters: 0, translation_attempts: 1, translation_characters: message.body.length });
    expect(await getTranslationStatus(env, now)).toMatchObject({ used: 1, resetsAt: Date.UTC(2026, 11, 1) });
  });

  it('prunes deleted, missing, and expired originals without clearing current usage', async () => {
    const { env, add, sqlite, row, seedUsage, usage } = setup();
    seedUsage(1);
    const requestFetch = provider();
    for (const id of ['keep', 'expired', 'deleted', 'missing']) {
      await translateChatMessage(env, add(id), dependencies(requestFetch));
    }
    sqlite.prepare('UPDATE chat_translations SET created_at = ? WHERE message_id = ?').run(NOW - 1000, 'expired');
    sqlite.prepare('UPDATE chat_messages SET deleted = 1 WHERE id = ?').run('deleted');
    sqlite.prepare('DELETE FROM chat_messages WHERE id = ?').run('missing');
    sqlite.prepare('INSERT INTO chat_translation_usage (month) VALUES (?)').run('2026-09');
    await pruneChatTranslations(env.DB, NOW - 500, NOW);
    expect(row('keep')).toBeDefined();
    for (const id of ['expired', 'deleted', 'missing']) expect(row(id)).toBeUndefined();
    expect(usage()).toMatchObject({ translation_attempts: 5 });
    expect(usage('2026-09')).toBeUndefined();
  });
});
