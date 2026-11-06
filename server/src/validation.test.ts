import { describe, expect, it } from 'vitest';

import {
  preferencesSchema,
  registerSchema,
  unregisterSchema,
  chatAdminBadgesSchema,
  chatAdminMessageBadgesSchema,
  chatReportSchema,
} from './validation';

const address = 'bc1qtestaddress000000000000000000000';

describe('Expo push token validation', () => {
  it.each([
    'ExponentPushToken[Abc_123-def]',
    'ExpoPushToken[Abc_123-def]',
  ])('accepts supported bounded token form %s', (pushToken) => {
    expect(registerSchema.safeParse({ pushToken, btcAddress: address }).success).toBe(true);
    expect(preferencesSchema.safeParse({ pushToken, btcAddress: address }).success).toBe(true);
    expect(unregisterSchema.safeParse({ pushToken }).success).toBe(true);
  });

  it.each([
    'ExponentPushToken[unterminated',
    'ExponentPushToken[token]trailing',
    `ExponentPushToken[${'a'.repeat(201)}]`,
    'not-an-expo-token',
  ])('rejects malformed or oversized token %s', (pushToken) => {
    expect(registerSchema.safeParse({ pushToken, btcAddress: address }).success).toBe(false);
    expect(unregisterSchema.safeParse({ pushToken }).success).toBe(false);
  });
});

describe('validation compatibility and bounded collection errors', () => {
  it('preserves absent preferences and fills defaults for an explicitly empty object', () => {
    const input = { pushToken: 'ExpoPushToken[test]', btcAddress: address };
    expect(registerSchema.parse(input).preferences).toBeUndefined();
    expect(registerSchema.parse({ ...input, preferences: {} }).preferences).toEqual({
      blocks: true, workers: true, bestDiff: true, rewards: true,
    });
  });

  it.each([0, 20])('accepts %i valid cosmetic badges in both admin schemas', (length) => {
    const badges = Array.from({ length }, () => 'supporter');
    expect(chatAdminBadgesSchema.safeParse({ address, badges }).success).toBe(true);
    expect(chatAdminMessageBadgesSchema.safeParse({ badges }).success).toBe(true);
  });

  it.each([21, 1000])('rejects %i malformed badges before accumulating per-element errors', (length) => {
    const badges = Array.from({ length }, () => null);
    for (const result of [
      chatAdminBadgesSchema.safeParse({ address, badges }),
      chatAdminMessageBadgesSchema.safeParse({ badges }),
    ]) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        const flat = result.error.flatten();
        expect(flat.formErrors).toEqual([]);
        expect(flat.fieldErrors.badges).toHaveLength(1);
      }
    }
  });

  it('accepts generated message UUIDs and rejects malformed IDs', () => {
    expect(chatReportSchema.safeParse({ token: 'test', messageId: crypto.randomUUID() }).success).toBe(true);
    expect(chatReportSchema.safeParse({ token: 'test', messageId: 'not-a-uuid' }).success).toBe(false);
  });
});
