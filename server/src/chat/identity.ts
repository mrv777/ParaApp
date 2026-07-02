/**
 * Chat identity: activity gate + short-lived HMAC session tokens.
 *
 * No signing / ownership proof (dropped in the spec). Posting is gated on the
 * address having pool activity; a valid gate mints an HMAC-signed token bound to
 * the address, which the WS route verifies before allowing posts.
 */

import type { Env } from '../types';
import { getUser } from '../parasite-api';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Activity gate: "any pool history" — the address resolves on Parasite Pool
 * (current hashrate may be 0). Only non-pool addresses are rejected.
 */
export async function passesActivityGate(
  env: Env,
  address: string
): Promise<boolean> {
  const result = await getUser(env.PARASITE_API_URL, address);
  return result.success && !!result.data;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(sig);
}

/** Constant-time string compare (avoids leaking the signature via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function issueSessionToken(
  address: string,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<string> {
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({ a: address, e: Date.now() + ttlMs }))
  );
  const signature = base64UrlEncode(await hmacSign(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<{ address: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const expected = base64UrlEncode(await hmacSign(secret, payload));
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const decoded = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as {
      a?: string;
      e?: number;
    };
    if (!decoded.a || !decoded.e || Date.now() > decoded.e) return null;
    return { address: decoded.a };
  } catch {
    return null;
  }
}
