import { describe, expect, it } from 'vitest';

import {
  preferencesSchema,
  registerSchema,
  unregisterSchema,
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
