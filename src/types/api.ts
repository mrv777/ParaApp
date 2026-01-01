/**
 * API response wrapper types
 */

/**
 * Generic cached data wrapper with timestamp
 */
export interface CachedData<T> {
  data: T;
  timestamp: number;
}

/**
 * API error structure
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

/**
 * Result type for API calls - either success with data or failure with error
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

/**
 * Fetch options for API client
 */
export interface FetchOptions {
  /** Request timeout in milliseconds (default: 10000, use 5000 for miners) */
  timeout?: number;
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay in ms between retries, doubles each attempt (default: 1000) */
  retryDelayMs?: number;
}

/**
 * Historical data time periods
 */
export type HistoricalPeriod = '1h' | '24h' | '7d' | '30d';

/**
 * Historical data intervals
 */
export type HistoricalInterval = '5m' | '15m' | '1h' | '4h' | '1d';
