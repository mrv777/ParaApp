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
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // Wait before retry (skip first attempt)
    if (attempt > 0) {
      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        lastError = createApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status
        );
        continue;
      }

      // Note: AxeOS API returns Content-Type: text/html but body is valid JSON
      // So we skip content-type validation and let JSON.parse handle it
      const data =
        responseType === 'text'
          ? ((await response.text()) as T)
          : ((await response.json()) as T);
      return { success: true, data };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = createApiError('Request timeout', undefined, 'TIMEOUT');
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
    }
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
      'Content-Type': 'application/json',
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
