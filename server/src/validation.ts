import { z } from 'zod';

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
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type UnregisterInput = z.infer<typeof unregisterSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
