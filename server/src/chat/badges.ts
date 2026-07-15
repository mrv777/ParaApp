/**
 * Chat address badges — admin-assigned cosmetic flair (e.g. bozo 🤡) pinned to an
 * address, independent of the nickname and of `official`. A badge never locks or
 * alters the nickname: a badged address keeps whatever name (or none) and the
 * badge is removable by an admin only.
 *
 * This is the single source of truth for the badge catalog; the RN client mirrors
 * it in `src/constants/chat.ts`. Adding a new badge is a one-line change here (and
 * in the client mirror) — no schema migration, since badges are stored as a JSON
 * array of these keys in chat_profiles.badges.
 */
export const CHAT_BADGES = {
  bozo: { emoji: '🤡', label: 'Bozo' },
} as const;

export type ChatBadge = keyof typeof CHAT_BADGES;

export const CHAT_BADGE_KEYS = Object.keys(CHAT_BADGES) as ChatBadge[];

/** Upper bound on how many badges one address can carry (guards the JSON blob). */
export const MAX_BADGES = 6;

export function isChatBadge(value: unknown): value is ChatBadge {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(CHAT_BADGES, value)
  );
}

/**
 * Normalize arbitrary input to a clean badge list: known keys only, de-duplicated,
 * order-preserved, capped at MAX_BADGES. Untrusted input (admin payloads, stored
 * JSON) always passes through here so unknown/legacy keys never reach a client.
 */
export function sanitizeBadges(input: unknown): ChatBadge[] {
  if (!Array.isArray(input)) return [];
  const out: ChatBadge[] = [];
  for (const value of input) {
    if (isChatBadge(value) && !out.includes(value)) out.push(value);
    if (out.length >= MAX_BADGES) break;
  }
  return out;
}

/** Parse the stored TEXT column (a JSON array of keys) into a clean badge list. */
export function parseBadges(stored: string | null | undefined): ChatBadge[] {
  if (!stored) return [];
  try {
    return sanitizeBadges(JSON.parse(stored));
  } catch {
    return [];
  }
}

/** Serialize for storage; null when empty so the column stays sparse. */
export function serializeBadges(badges: ChatBadge[]): string | null {
  const clean = sanitizeBadges(badges);
  return clean.length ? JSON.stringify(clean) : null;
}
