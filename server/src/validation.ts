import { z } from 'zod';
import { MAX_NICKNAME_LENGTH } from './chat/protocol';

export const registerSchema = z.object({
  pushToken: z.string().min(1).startsWith('ExponentPushToken['),
  btcAddress: z.string().min(26).max(62),
  preferences: z
    .object({
      blocks: z.boolean().default(true),
      workers: z.boolean().default(true),
      bestDiff: z.boolean().default(true),
    })
    .optional(),
  widgetUpdatesEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const unregisterSchema = z.object({
  pushToken: z.string().min(1),
});

export const preferencesSchema = z.object({
  pushToken: z.string().min(1).startsWith('ExponentPushToken['),
  btcAddress: z.string().min(26).max(62),
  blocks: z.boolean().optional(),
  workers: z.boolean().optional(),
  bestDiff: z.boolean().optional(),
  widgetUpdatesEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

// Strict charset (base58/bech32 are alphanumeric), not just length: the address
// is both the chat identity key (bans, blocks, rate limits) and a path segment
// sent to the pool API. Without this, `realAddr#x` / `realAddr?x=1` resolve the
// real user upstream (fragment/query stripped by fetch) yet count as distinct
// chat identities — unlimited ban evasion.
const chatAddressSchema = z.string().regex(/^[a-zA-Z0-9]{26,62}$/);

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

export const chatEulaSchema = z.object({
  token: z.string().min(1),
  version: z.string().min(1).max(20),
});

export const chatAdminBanSchema = z.object({
  address: chatAddressSchema,
  reason: z.string().max(500).optional(),
});

export const chatAdminNicknameSchema = z.object({
  address: chatAddressSchema,
  // Empty string clears the handle (falls back to truncated address).
  nickname: z.string().max(MAX_NICKNAME_LENGTH),
  // Assigned handles are locked (official) by default; pass false for a plain,
  // user-overwritable name.
  official: z.boolean().optional(),
});

export const chatAnnouncementSchema = z.object({
  body: z.string().min(1).max(280),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type UnregisterInput = z.infer<typeof unregisterSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type ChatSessionInput = z.infer<typeof chatSessionSchema>;
