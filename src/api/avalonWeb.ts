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
import type { ApiResult } from '@/types';

export const AVALON_WEB_TIMEOUT = 8000;

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
    const res = await fetchWithTimeout(
      `http://${ip}/get_auth.cgi?num=${Math.random()}`,
      { method: 'GET' }
    );
    if (!res.ok) {
      return {
        success: false,
        error: { message: `HTTP ${res.status}`, status: res.status },
      };
    }
    const text = await res.text();
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
    const res = await fetchWithTimeout(`http://${ip}/login.cgi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `auth=${cookie}`,
      },
      body: `passwd=${encodeURIComponent(cookie)}`,
    });
    const html = await res.text();
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
 * Configure pool slots via the web UI. Avalon supports up to 3 pool
 * slots; pass empty strings for unused slots to clear them.
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
  slots.forEach((slot, i) => {
    const n = i + 1;
    params.set(`pool${n}`, slot?.url ?? '');
    params.set(`worker${n}`, slot?.worker ?? '');
    params.set(`passwd${n}`, slot?.password ?? '');
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
    const res = await fetchWithTimeout(`http://${ip}${path}`, {
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
    const html = await res.text();
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
 * Promise-race-based timeout wrapper. RN's fetch supports AbortSignal
 * but not all Hermes versions wire it through cleanly; we use
 * Promise.race to be safe across versions.
 */
function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = AVALON_WEB_TIMEOUT
): Promise<Response> {
  return Promise.race([
    fetch(url, init),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    ),
  ]);
}
