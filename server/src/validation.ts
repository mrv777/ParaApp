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

export const chatSessionSchema = z.object({
  btcAddress: z.string().min(26).max(62),
});

export const chatNicknameSchema = z.object({
  token: z.string().min(1),
  // Empty string clears the nickname (falls back to truncated address).
  nickname: z.string().max(MAX_NICKNAME_LENGTH),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type UnregisterInput = z.infer<typeof unregisterSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type ChatSessionInput = z.infer<typeof chatSessionSchema>;
