/**
 * Display-side hardening for chat message bodies.
 *
 * The server sanitizes on write (server/src/chat/{sanitize,room}.ts is the
 * source of truth), but the client trusts whatever history D1 returns — rows
 * that predate that sanitize, or seeded/edge content, arrive raw. So we mirror
 * the key rules at render time as defense-in-depth:
 *   - collapse blank-line runs so a message can't be a wall of empty lines
 *   - strip bidi overrides + zero-width chars (keeping emoji ZWJ U+200D and
 *     ZWNJ U+200C, which have legitimate uses)
 *   - cap combining-mark ("zalgo") stacks at two per cluster
 * Keep this in sync with server/src/chat/sanitize.ts + normalizeBody().
 */

const INVISIBLE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C\u200B\uFEFF]/g;
const ZALGO = /(\p{M}\p{M})\p{M}+/gu;

export function sanitizeDisplayBody(body: string): string {
  return body
    .replace(INVISIBLE, '')
    .replace(ZALGO, '$1')
    .replace(/[ \t]+$/gm, '') // trailing spaces per line
    .replace(/\n{2,}/g, '\n') // no blank-line walls
    .trim();
}
