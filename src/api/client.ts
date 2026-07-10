/**
 * Base API client with timeout, retry logic, and error handling
 */

import type { ApiResult, ApiError, FetchOptions } from '@/types';

/** Default timeout for remote APIs (ms) */
const DEFAULT_TIMEOUT = 10000;

/** Default timeout for local miner APIs (ms) */
export const MINER_TIMEOUT = 5000;

/** Default number of retry attempts */
const DEFAULT_RETRIES = 3;

/** Base delay between retries (doubles each attempt) */
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/**
 * Create an API error object
 */
function createApiError(
  message: string,
  status?: number,
  code?: string
): ApiError {
  return { message, status, code };
}

/**
 * Fetch with timeout, retry logic, and typed result
 * @param url - URL to fetch
 * @param options - Fetch options including timeout and retry settings
 * @returns ApiResult with data on success or error on failure
 */
export async function fetchWithTimeout<T>(
  url: string,
  options: FetchOptions & RequestInit = {}
): Promise<ApiResult<T>> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY,
    responseType = 'json',
    ...fetchOptions
  } = options;

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const externalSignal = fetchOptions.signal;
    if (externalSignal?.aborted) {
      lastError = createApiError('Request aborted', undefined, 'ABORTED');
      break;
    }

    // Wait before retry (skip first attempt)
    if (attempt > 0) {
      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay, externalSignal);
      if (externalSignal?.aborted) {
        lastError = createApiError('Request aborted', undefined, 'ABORTED');
        break;
      }
    }

    const controller = new AbortController();
    let didTimeout = false;
    const handleExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', handleExternalAbort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = createApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status
        );
        // Only retry transient failures: server errors (5xx) and rate limits
        // (429). Other 4xx are deterministic — retrying just wastes attempts
        // and backoff (e.g. a 404 for an unknown address).
        if (response.status >= 500 || response.status === 429) {
          continue;
        }
        return { success: false, error: lastError };
      }

      // Note: AxeOS API returns Content-Type: text/html but body is valid JSON
      // So we skip content-type validation and let JSON.parse handle it
      const data =
        responseType === 'text'
          ? ((await response.text()) as T)
          : ((await response.json()) as T);
      return { success: true, data };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = didTimeout
            ? createApiError('Request timeout', undefined, 'TIMEOUT')
            : createApiError('Request aborted', undefined, 'ABORTED');
        } else {
          lastError = createApiError(
            error.message,
            undefined,
            'NETWORK_ERROR'
          );
        }
      } else {
        lastError = createApiError('Unknown error', undefined, 'UNKNOWN');
      }
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', handleExternalAbort);
    }

    // An owning background task cancelled the whole operation. Retrying would
    // outlive that task's execution window and keep a headless runtime awake.
    if (externalSignal?.aborted) break;
  }

  return {
    success: false,
    error: lastError || createApiError('Request failed'),
  };
}

/**
 * POST request with JSON body
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  options: FetchOptions & Omit<RequestInit, 'method' | 'body'> = {}
): Promise<ApiResult<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * POST request expecting text response (not JSON)
 * Used for endpoints that return text/plain
 */
export async function postText(
  url: string,
  body: unknown,
  options: FetchOptions & Omit<RequestInit, 'method' | 'body'> = {}
): Promise<ApiResult<string>> {
  return fetchWithTimeout<string>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
    responseType: 'text',
  });
}

/**
 * PATCH request with JSON body
 * Note: Content-Type header is intentionally omitted because some miner
 * firmware (Hammer) silently ignores PATCH requests that include it.
 * The body is still valid JSON and both AxeOS and Hammer parse it correctly.
 */
export async function patchJson<T>(
  url: string,
  body: unknown,
  options: FetchOptions & Omit<RequestInit, 'method' | 'body'> = {}
): Promise<ApiResult<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'PATCH',
    headers: {
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Check if a result is successful (type guard)
 */
export function isSuccess<T>(
  result: ApiResult<T>
): result is { success: true; data: T } {
  return result.success;
}

/**
 * Check if a result is an error (type guard)
 */
export function isError<T>(
  result: ApiResult<T>
): result is { success: false; error: ApiError } {
  return !result.success;
}
