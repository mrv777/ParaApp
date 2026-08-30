/**
 * Avalon web CGI client (port 80).
 *
 * The on-device dashboard is a tiny SPA backed by a handful of CGI
 * scripts. We only use it as a fallback for things the unauthenticated
 * cgminer interface can't do — pool config (always) and reboot (when
 * the firmware predates the cgminer reboot path).
 *
 * Auth is cookie-based: GET /get_auth.cgi for a salt, POST /login.cgi
 * with `salt + sha256(password).slice(0, 24)`. The same value is sent
 * back as the `auth` cookie on subsequent CGI calls.
 *
 * See CANAAN_AVALON_API.md for the full protocol.
 */

import { sha256 } from 'js-sha256';
import { fetch as expoFetch } from 'expo/fetch';
import type { ApiResult } from '@/types';

export const AVALON_WEB_TIMEOUT = 8000;
export const AVALON_WEB_MAX_RESPONSE_BYTES = 1024 * 1024;

interface TimedTextResponse {
  ok: boolean;
  status: number;
  text: string;
}

class ResponseTooLargeError extends Error {
  constructor() {
    super('Miner response exceeded 1 MiB');
    this.name = 'ResponseTooLargeError';
  }
}

function exceedsUtf8Limit(value: string, limit: number): boolean {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      bytes += 4;
    } else bytes += 3;
    if (bytes > limit) return true;
  }
  return false;
}

async function readBoundedText(
  response: Response,
  controller: AbortController
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    // Web/test fallback. Native builds use expo/fetch's streaming body.
    const text = await response.text();
    if (exceedsUtf8Limit(text, AVALON_WEB_MAX_RESPONSE_BYTES)) {
      throw new ResponseTooLargeError();
    }
    return text;
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > AVALON_WEB_MAX_RESPONSE_BYTES) {
        controller.abort();
        await reader.cancel('Response too large').catch(() => undefined);
        throw new ResponseTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

interface AuthSession {
  /** The full `salt + hashed-password` blob used as the auth cookie value */
  cookie: string;
}

/**
 * Hash an admin password the way the device expects:
 * `salt + sha256(plaintext).slice(0, 24)`.
 */
function buildAuthCookie(salt: string, password: string): string {
  return salt + sha256(password).slice(0, 24);
}

/**
 * GET /get_auth.cgi → returns a JSONP callback containing the salt.
 * Salt is reused across short windows on the firmware we tested, but
 * we still fetch fresh per session to avoid relying on that quirk.
 */
async function fetchAuthSalt(ip: string): Promise<ApiResult<string>> {
  try {
    const res = await fetchTextWithTimeout(
      `http://${ip}/get_auth.cgi?num=${Math.random()}`,
      { method: 'GET' }
    );
    if (!res.ok) {
      return {
        success: false,
        error: { message: `HTTP ${res.status}`, status: res.status },
      };
    }
    const text = res.text;
    const match = text.match(/"auth":"([0-9a-f]+)"/);
    if (!match) {
      return {
        success: false,
        error: {
          message: 'Could not parse salt from get_auth.cgi',
          code: 'PARSE_ERROR',
        },
      };
    }
    return { success: true, data: match[1] };
  } catch (err) {
    return {
      success: false,
      error: {
        message: (err as Error).message ?? 'Network error',
        code: 'NETWORK_ERROR',
      },
    };
  }
}

/**
 * Authenticate against the web CGI and return a session usable for
 * subsequent CGI calls. The "session" is just the auth cookie value;
 * the server doesn't issue a Set-Cookie header.
 *
 * Failure modes worth noting:
 *  - Wrong password: login.cgi returns 200 with the login HTML instead
 *    of the dashboard. We detect that by checking for the
 *    `loginform` marker.
 *  - Network error: device offline or rebooting.
 */
export async function login(
  ip: string,
  password: string
): Promise<ApiResult<AuthSession>> {
  const salt = await fetchAuthSalt(ip);
  if (!salt.success) return salt;

  const cookie = buildAuthCookie(salt.data, password);
  try {
    const res = await fetchTextWithTimeout(`http://${ip}/login.cgi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `auth=${cookie}`,
      },
      body: `passwd=${encodeURIComponent(cookie)}`,
    });
    // A server/HTTP error must not be mistaken for a successful login just
    // because the error body happens to lack the `loginform` marker.
    if (!res.ok) {
      return {
        success: false,
        error: { message: `HTTP ${res.status}`, status: res.status },
      };
    }
    const html = res.text;
    // Successful login lands on the dashboard; the failure path
    // re-renders the login page (which contains a `loginform`).
    if (/<form[^>]+name="loginform"/i.test(html)) {
      return {
        success: false,
        error: {
          message: 'Wrong admin password',
          code: 'AUTH_FAILED',
          status: 401,
        },
      };
    }
    return { success: true, data: { cookie } };
  } catch (err) {
    return {
      success: false,
      error: {
        message: (err as Error).message ?? 'Network error',
        code: 'NETWORK_ERROR',
      },
    };
  }
}

/**
 * Configure pool slots via the web UI. Avalon supports up to 3 pool slots.
 * A slot passed as `undefined` is omitted from the POST entirely, leaving the
 * device's existing value for that slot untouched; a slot with an empty `url`
 * IS posted and clears that slot on the device. (See the inline note below for
 * the failover caveat on slot 1.)
 *
 * The CGI returns the pool config page HTML on success. We only check
 * for HTTP 200 since the device gives no machine-readable
 * confirmation.
 */
export interface PoolSlot {
  url: string;
  worker: string;
  password: string;
}

export async function setPools(
  ip: string,
  session: AuthSession,
  slots: [PoolSlot, PoolSlot?, PoolSlot?]
): Promise<ApiResult<void>> {
  const params = new URLSearchParams();
  // Only emit params for slots we actually have. A blank slot posted as
  // `poolN=''` would CLEAR that slot on the device (see the empty-string
  // note above) — but callers pass `undefined` for slots the app never
  // loaded, so skipping them leaves the device's existing pool table
  // untouched. (Slot 1 is still hydrated from the active pool upstream, so
  // a save right after a device failover can write the failover URL into
  // slot 1 — fixing that needs reading the live 3-slot table first.)
  slots.forEach((slot, i) => {
    if (!slot) return;
    const n = i + 1;
    params.set(`pool${n}`, slot.url ?? '');
    params.set(`worker${n}`, slot.worker ?? '');
    params.set(`passwd${n}`, slot.password ?? '');
  });
  return postCgi(ip, session, '/cgpools.cgi', params.toString());
}

/**
 * Reboot via the web CGI. Prefer `avalon.reboot` (cgminer ascset, no
 * password required) when available — this is the fallback path.
 */
export async function reboot(
  ip: string,
  session: AuthSession
): Promise<ApiResult<void>> {
  return postCgi(ip, session, '/reboot.cgi', '');
}

async function postCgi(
  ip: string,
  session: AuthSession,
  path: string,
  body: string
): Promise<ApiResult<void>> {
  try {
    const res = await fetchTextWithTimeout(`http://${ip}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `auth=${session.cookie}`,
      },
      // Always send a body (even empty) — the CGI server hangs on
      // POSTs without a Content-Length header.
      body,
    });
    if (!res.ok) {
      return {
        success: false,
        error: { message: `HTTP ${res.status}`, status: res.status },
      };
    }
    const html = res.text;
    // If the CGI rejected our session it returns the login page.
    if (/<form[^>]+name="loginform"/i.test(html)) {
      return {
        success: false,
        error: {
          message: 'Session expired',
          code: 'AUTH_EXPIRED',
          status: 401,
        },
      };
    }
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: {
        message: (err as Error).message ?? 'Network error',
        code: 'NETWORK_ERROR',
      },
    };
  }
}

/**
 * Timeout wrapper that actually aborts the underlying request, so a
 * timed-out CGI write can't land late and interleave with a retry. Mirrors
 * the AbortController pattern in `client.ts` (proven on this RN stack).
 */
async function fetchTextWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = AVALON_WEB_TIMEOUT
): Promise<TimedTextResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await expoFetch(url, { ...init, signal: controller.signal });
    const contentLength = Number(response.headers?.get?.('content-length'));
    if (
      Number.isFinite(contentLength) &&
      contentLength > AVALON_WEB_MAX_RESPONSE_BYTES
    ) {
      controller.abort();
      throw new ResponseTooLargeError();
    }
    // Keep the abort timer alive through body consumption. Some miner CGI
    // endpoints send headers and then stall indefinitely.
    const text = await readBoundedText(response, controller);
    return { ok: response.ok, status: response.status, text };
  } catch (err) {
    if (err instanceof ResponseTooLargeError) throw err;
    // Normalize an abort into the same "Timeout" error the old race threw.
    if (controller.signal.aborted) {
      throw new Error('Timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
