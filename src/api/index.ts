// Base client utilities
export {
  fetchWithTimeout,
  postJson,
  patchJson,
  isSuccess,
  isError,
  MINER_TIMEOUT,
} from './client';

// Parasite Pool API
export * as parasite from './parasite';

// Parasite Pool Refinery (router) API — read-only order monitoring
export * as refinery from './refinery';

// AxeOS Miner API
export * as axeOS from './axeOS';

// Canaan Avalon Miner API (CGMiner JSON RPC on port 4028)
export * as avalon from './avalon';

// Canaan Avalon web CGI fallback (port 80, admin password)
export * as avalonWeb from './avalonWeb';

// GekkoScience KBox API (HTTP /api/v1/ on port 80, X-API-Key auth)
export * as kbox from './kbox';

// LuxOS / LUXminer API (Antminers on Luxor firmware; HTTP RPC on port 8080)
export * as luxos from './luxos';

// Mempool.space API
export * as mempool from './mempool';
