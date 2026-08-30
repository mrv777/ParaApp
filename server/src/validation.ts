import { z } from 'zod';
import { MAX_NICKNAME_LENGTH } from './chat/protocol';

// Expo currently issues both legacy ExponentPushToken[...] and
// ExpoPushToken[...] values. Keep both for compatibility while bounding the
// token before it reaches D1 or the Expo push service.
const expoPushToken = z
  .string()
  .max(256)
  .regex(/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{1,200}\]$/);

export const registerSchema = z.object({
  pushToken: expoPushToken,
  btcAddress: z.string().min(26).max(62),
  preferences: z
    .object({
      blocks: z.boolean().default(true),
      workers: z.boolean().default(true),
      bestDiff: z.boolean().default(true),
      rewards: z.boolean().default(true),
    })
    .optional(),
  widgetUpdatesEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const unregisterSchema = z.object({
  pushToken: expoPushToken,
});

export const preferencesSchema = z.object({
  pushToken: expoPushToken,
  btcAddress: z.string().min(26).max(62),
  blocks: z.boolean().optional(),
  workers: z.boolean().optional(),
  bestDiff: z.boolean().optional(),
  rewards: z.boolean().optional(),
  widgetUpdatesEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

// Strict charset (base58/bech32 are alphanumeric), not just length: the address
// is both the chat identity key (bans, blocks, rate limits) and a path segment
// sent to the pool API. Without this, `realAddr#x` / `realAddr?x=1` resolve the
// real user upstream (fragment/query stripped by fetch) yet count as distinct
// chat identities — unlimited ban evasion.
export const chatAddressSchema = z.string().regex(/^[a-zA-Z0-9]{26,62}$/);

export const chatSessionSchema = z.object({
  btcAddress: chatAddressSchema,
});

export const chatNicknameSchema = z.object({
  token: z.string().min(1),
  // Empty string clears the nickname (falls back to truncated address).
  nickname: z.string().max(MAX_NICKNAME_LENGTH),
});

export const chatReportSchema = z.object({
  token: z.string().min(1),
  // UUID only — message ids are crypto.randomUUID(). Also prevents crafted ids
  // from reaching the admin page (defense against HTML/JS-context injection).
  messageId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

// Block by messageId, not address: payloads only ever carry truncated sender
// keys, so the client cannot (and must not) know full addresses. The server
// resolves the message's sender itself.
export const chatBlockSchema = z.object({
  token: z.string().min(1),
  messageId: z.string().uuid(),
});

export const chatUnblockSchema = z.object({
  token: z.string().min(1),
  blockId: z.string().regex(/^[a-f0-9]{64}$/),
});

export const chatEulaSchema = z.object({
  token: z.string().min(1),
  version: z.string().min(1).max(20),
});

// Optional temp-ban duration (seconds); absent = permanent. Capped at 1 year.
const banDurationSec = z.number().int().positive().max(365 * 24 * 60 * 60);

export const chatAdminBanSchema = z.object({
  address: chatAddressSchema,
  reason: z.string().max(500).optional(),
  durationSec: banDurationSec.optional(),
  // Also soft-delete every message from this sender (ban-purge).
  purge: z.boolean().optional(),
});

export const chatAdminNicknameSchema = z.object({
  address: chatAddressSchema,
  // Empty string clears the handle (falls back to truncated address).
  nickname: z.string().max(MAX_NICKNAME_LENGTH),
  // Assigned handles are locked (official) by default; pass false for a plain,
  // user-overwritable name.
  official: z.boolean().optional(),
});

// Set (absolute replace) an address's cosmetic badges. Keys are validated
// against the catalog server-side (sanitizeBadges) — the array cap here just
// bounds the payload before that.
export const chatAdminBadgesSchema = z.object({
  address: chatAddressSchema,
  badges: z.array(z.string().max(32)).max(20),
});

// Same, for the sender of a specific message (address resolved server-side).
export const chatAdminMessageBadgesSchema = z.object({
  badges: z.array(z.string().max(32)).max(20),
});

// Ban the sender of a specific message; the server resolves the (full) address
// from the id, so the client never supplies one. Reason is optional.
export const chatAdminMessageBanSchema = z.object({
  reason: z.string().max(500).optional(),
  durationSec: banDurationSec.optional(),
  purge: z.boolean().optional(),
});

// Assign/clear a nickname for the sender of a specific message. Same shape as
// chatAdminNicknameSchema minus the address (resolved server-side from the id).
export const chatAdminMessageNicknameSchema = z.object({
  nickname: z.string().max(MAX_NICKNAME_LENGTH),
  official: z.boolean().optional(),
});

export const chatAnnouncementSchema = z.object({
  body: z.string().min(1).max(280),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type UnregisterInput = z.infer<typeof unregisterSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type ChatSessionInput = z.infer<typeof chatSessionSchema>;
