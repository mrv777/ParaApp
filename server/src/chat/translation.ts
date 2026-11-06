import { MAX_MESSAGE_LENGTH } from './protocol';
import { stripInvisible } from './sanitize';

/** Only server-held credentials are used; originals remain the canonical content. */
export interface TranslationEnv {
  DB: D1Database;
  GOOGLE_TRANSLATE_API_KEY?: string;
  CHAT_TRANSLATION_ENABLED?: string;
  CHAT_TRANSLATION_MONTHLY_LIMIT?: string;
}

export interface ChatTranslationStatus {
  enabled: boolean;
  monthlyLimit: number;
  used: number;
  limitReached: boolean;
  /** Millisecond epoch at the start of the next UTC calendar month. */
  resetsAt: number;
}

export interface ChatTranslation {
  text: string;
  sourceLanguage: string;
}

interface TranslationDependencies {
  fetch?: typeof fetch;
  now?: () => number;
}

const API_URL = 'https://translation.googleapis.com/language/translate/v2';
const CHARACTER_LIMIT = 250_000; // Each method: at most 500k total/month.
const MAX_TRANSLATED_LENGTH = 2_000;
// Stop with less than one maximum-size message of headroom. At most 499
// characters remain unused, and status can report exhaustion consistently.

function config(env: TranslationEnv) {
  const value = Number(env.CHAT_TRANSLATION_MONTHLY_LIMIT ?? 500);
  const monthlyLimit = Number.isFinite(value)
    ? Math.min(500, Math.max(0, Math.floor(value)))
    : 500;
  const key = env.GOOGLE_TRANSLATE_API_KEY?.trim();
  return {
    monthlyLimit,
    key,
    enabled: env.CHAT_TRANSLATION_ENABLED === 'on' && !!key && monthlyLimit > 0,
  };
}

function monthAt(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

export async function getTranslationStatus(
  env: TranslationEnv,
  now = Date.now()
): Promise<ChatTranslationStatus> {
  const { enabled, monthlyLimit } = config(env);
  const row = await env.DB.prepare(
    'SELECT translation_attempts, detection_characters, translation_characters FROM chat_translation_usage WHERE month = ?'
  ).bind(monthAt(now)).first<{
    translation_attempts: number;
    detection_characters: number;
    translation_characters: number;
  }>();
  const date = new Date(now);
  return {
    enabled,
    monthlyLimit,
    used: row?.translation_attempts ?? 0,
    limitReached: (row?.translation_attempts ?? 0) >= monthlyLimit
      || (row?.detection_characters ?? 0) + MAX_MESSAGE_LENGTH > CHARACTER_LIMIT
      || (row?.translation_characters ?? 0) + MAX_MESSAGE_LENGTH > CHARACTER_LIMIT,
    resetsAt: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  };
}

async function ensureUsage(db: D1Database, month: string): Promise<void> {
  await db.prepare(
    'INSERT OR IGNORE INTO chat_translation_usage (month) VALUES (?)'
  ).bind(month).run();
}

/** These single conditional UPDATEs serialize reservations across all Workers. */
async function reserveDetection(
  db: D1Database,
  month: string,
  characters: number,
  monthlyLimit: number
): Promise<boolean> {
  await ensureUsage(db, month);
  return !!await db.prepare(
    `UPDATE chat_translation_usage
     SET detection_characters = detection_characters + ?
     WHERE month = ? AND detection_characters + ? <= ?
       AND translation_attempts < ? AND detection_characters + ? <= ?
       AND translation_characters + ? <= ?
     RETURNING month`
  ).bind(characters, month, characters, CHARACTER_LIMIT, monthlyLimit,
    MAX_MESSAGE_LENGTH, CHARACTER_LIMIT, MAX_MESSAGE_LENGTH, CHARACTER_LIMIT).first();
}

async function reserveTranslation(
  db: D1Database,
  month: string,
  characters: number,
  monthlyLimit: number
): Promise<boolean> {
  await ensureUsage(db, month);
  return !!await db.prepare(
    `UPDATE chat_translation_usage
     SET translation_attempts = translation_attempts + 1,
         translation_characters = translation_characters + ?
     WHERE month = ? AND translation_attempts < ?
       AND translation_characters + ? <= ?
       AND translation_characters + ? <= ?
     RETURNING month`
  ).bind(characters, month, monthlyLimit, characters, CHARACTER_LIMIT,
    MAX_MESSAGE_LENGTH, CHARACTER_LIMIT).first();
}

// Preserve externally meaningful identifiers exactly. No substitutions are sent
// to Google: reject a result that changes one rather than risk displaying it.
function protectedIdentifiers(body: string): string[] {
  return body.match(
    /(?:https?:\/\/|stratum\+tcp:\/\/)[^\s<>]+|\b(?:bc1|tb1|bcrt1)[a-zA-Z0-9]{11,87}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/gi
  ) ?? [];
}

/** Decode once: Basic v2 may return HTML entities even for plain-text input. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole;
    const hex = entity[1].toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : whole;
  });
}

function cleanTranslation(text: unknown, original: string): string | null {
  if (typeof text !== 'string' || text.length > MAX_TRANSLATED_LENGTH * 8) return null;
  const cleaned = stripInvisible(decodeEntities(text))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!cleaned || cleaned.length > MAX_TRANSLATED_LENGTH) return null;
  if (protectedIdentifiers(original).some((identifier) => !cleaned.includes(identifier))) return null;
  return cleaned;
}

async function canonicalExists(
  db: D1Database,
  id: string,
  body: string
): Promise<boolean> {
  return !!await db.prepare(
    'SELECT id FROM chat_messages WHERE id = ? AND body = ? AND deleted = 0'
  ).bind(id, body).first();
}

async function finish(
  db: D1Database,
  id: string,
  status: 'english' | 'failed' | 'skipped',
  now: number,
  sourceLanguage: string | null = null
): Promise<void> {
  await db.prepare(
    `UPDATE chat_translations SET status = ?, source_language = ?, text = NULL, updated_at = ?
     WHERE message_id = ? AND status = 'pending'`
  ).bind(status, sourceLanguage, now, id).run();
}

async function googleRequest(
  requestFetch: typeof fetch,
  key: string,
  suffix: string,
  body: Record<string, string>
): Promise<unknown> {
  const response = await requestFetch(`${API_URL}${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Translation provider request failed');
  return response.json();
}

/**
 * New-message background work only; never called by arbitrary client text.
 * A durable unique claim prevents duplicate calls and automatic retries, even
 * after failures or Worker restarts. Reserve each provider call in its current
 * UTC month: a detect/translate pair straddling midnight uses the two respective
 * months. Timeouts do not refund characters or non-English translation attempts.
 */
export async function translateChatMessage(
  env: TranslationEnv,
  message: { id: string; body: string; address?: string },
  dependencies: TranslationDependencies = {}
): Promise<ChatTranslation | null> {
  const { enabled, monthlyLimit, key } = config(env);
  if (!enabled || !key || !message.body || message.body.length > MAX_MESSAGE_LENGTH) return null;
  const now = dependencies.now ?? Date.now;
  const requestFetch = dependencies.fetch ?? fetch;
  const { id, body } = message;
  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO chat_translations (message_id, status, created_at, updated_at)
     SELECT id, 'pending', ?, ? FROM chat_messages
     WHERE id = ? AND body = ? AND deleted = 0 AND (? IS NULL OR address = ?)`
  ).bind(now(), now(), id, body, message.address ?? null, message.address ?? null).run();
  if (!claim.meta.changes) return null;

  try {
    // Emoji, numbers, punctuation, and bare links/wallets need no provider call.
    let prose = body;
    for (const identifier of protectedIdentifiers(body)) prose = prose.replace(identifier, '');
    if (!/\p{L}/u.test(prose)) {
      await finish(env.DB, id, 'skipped', now());
      return null;
    }
    // UTF-16 length conservatively over-reserves astral characters rather than
    // risking an undercount of Google's Unicode-character billing.
    const characters = body.length;
    if (!await reserveDetection(env.DB, monthAt(now()), characters, monthlyLimit)) {
      await finish(env.DB, id, 'skipped', now());
      return null;
    }
    if (!await canonicalExists(env.DB, id, body)) {
      await finish(env.DB, id, 'skipped', now());
      return null;
    }
    const detection = await googleRequest(requestFetch, key, '/detect', { q: body }) as {
      data?: { detections?: { language?: unknown }[][] };
    };
    const source = detection?.data?.detections?.[0]?.[0]?.language;
    if (typeof source !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(source) || source === 'und') {
      await finish(env.DB, id, 'failed', now());
      return null;
    }
    // Google deprecated confidence/isReliable and advises against thresholds.
    if (source === 'en' || source.startsWith('en-')) {
      await finish(env.DB, id, 'english', now(), source);
      return null;
    }
    if (!await canonicalExists(env.DB, id, body)) {
      await finish(env.DB, id, 'skipped', now(), source);
      return null;
    }
    if (!await reserveTranslation(env.DB, monthAt(now()), characters, monthlyLimit)) {
      await finish(env.DB, id, 'skipped', now(), source);
      return null;
    }
    const translated = await googleRequest(requestFetch, key, '', {
      q: body, source, target: 'en', format: 'text', model: 'nmt',
    }) as { data?: { translations?: { translatedText?: unknown }[] } };
    const text = cleanTranslation(translated?.data?.translations?.[0]?.translatedText, body);
    if (!text) {
      await finish(env.DB, id, 'failed', now(), source);
      return null;
    }
    const saved = await env.DB.prepare(
      `UPDATE chat_translations SET status = 'translated', source_language = ?, text = ?, updated_at = ?
       WHERE message_id = ? AND status = 'pending'
         AND EXISTS (SELECT 1 FROM chat_messages WHERE id = ? AND body = ? AND deleted = 0)
       RETURNING message_id`
    ).bind(source, text, now(), id, id, body).first();
    if (!saved) {
      await finish(env.DB, id, 'skipped', now(), source);
      return null;
    }
    return { text, sourceLanguage: source };
  } catch {
    // Never log provider bodies, API keys, or chat content. No retry/refund.
    await finish(env.DB, id, 'failed', now()).catch(() => {});
    return null;
  }
}

/** Bound cache retention to original-message retention; usage resets by month. */
export async function pruneChatTranslations(
  db: D1Database,
  olderThanMs: number,
  now = Date.now()
): Promise<void> {
  await db.prepare(
    `DELETE FROM chat_translations WHERE created_at < ? OR NOT EXISTS (
       SELECT 1 FROM chat_messages m WHERE m.id = message_id AND m.deleted = 0
     )`
  ).bind(olderThanMs).run();
  await db.prepare('DELETE FROM chat_translation_usage WHERE month < ?')
    .bind(monthAt(now)).run();
}
