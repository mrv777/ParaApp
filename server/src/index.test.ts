import { describe, expect, it } from 'vitest';

import worker from './index';

describe('admin HTML security headers', () => {
  it('cannot be embedded in another page', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/chat/admin'),
      {} as never,
      {} as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
});
