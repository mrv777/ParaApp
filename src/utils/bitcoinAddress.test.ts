import { describe, expect, it } from 'vitest';

import { normalizeBitcoinAddress } from './bitcoinAddress';

describe('normalizeBitcoinAddress', () => {
  it('canonicalizes uppercase Bech32 and Bech32m addresses', () => {
    expect(normalizeBitcoinAddress('BC1QABC123')).toBe('bc1qabc123');
    expect(normalizeBitcoinAddress('BC1PABC123')).toBe('bc1pabc123');
  });

  it('preserves Base58 and invalid mixed-case text exactly', () => {
    expect(normalizeBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBe(
      '1BoatSLRHtKNngkdXEeobR76b53LETtpyT'
    );
    expect(normalizeBitcoinAddress('bc1QMixedCase')).toBe('bc1QMixedCase');
  });
});
