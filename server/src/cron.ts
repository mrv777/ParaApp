/**
 * Cron job logic for push notification polling
 * Runs every minute to detect changes and send notifications
 */

import type {
  Env,
  WorkerStatusMap,
  WorkerStatusEntry,
  ExpoPushMessage,
  ParasiteWorker,
  PushSubscription,
  NotificationPreferences,
} from './types';
import {
  getUniqueAddresses,
  getUserState,
  upsertUserState,
  getPoolState,
  updatePoolState,
  getActiveTokensByAddress,
  getAllActiveSubscriptions,
  getPreferences,
  markTokenInactive,
} from './db';
import { getUser, getPoolStats } from './parasite-api';
import { sendPushNotifications, createPushMessage } from './push';

// 5 minutes = 5 cron cycles (1 min each)
const OFFLINE_CHECK_THRESHOLD = 5;
// Worker considered stale if lastSubmission is older than 5 minutes
const STALE_THRESHOLD_SECONDS = 300;

/**
 * Parse difficulty string like "1.12T" or "88.2G" to raw number
 * Copied from mobile app for consistency
 */
function parseDifficulty(diffStr: string): number {
  if (!diffStr || diffStr === 'N/A') return 0;

  const match = diffStr.match(/^([\d.]+)([KMGTP]?)$/i);
  if (!match) {
    const num = parseFloat(diffStr);
    return isNaN(num) ? 0 : num;
  }

  const value = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();

  const multipliers: Record<string, number> = {
    '': 1,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
  };

  return value * (multipliers[suffix] || 1);
}

/**
 * Check if a worker is stale based on lastSubmission timestamp
 */
function isWorkerStale(lastSubmissionSeconds: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - lastSubmissionSeconds > STALE_THRESHOLD_SECONDS;
}

/**
 * Main cron job entry point
 */
export async function runCronJob(env: Env): Promise<void> {
  console.log('Cron job started');

  const allMessages: ExpoPushMessage[] = [];

  try {
    // 1. Check for pool-wide block detection
    const blockMessages = await checkPoolBlock(env);
    allMessages.push(...blockMessages);

    // 2. Process each user for worker/difficulty changes
    const addresses = await getUniqueAddresses(env.DB);
    console.log(`Processing ${addresses.length} unique addresses`);

    for (const address of addresses) {
      try {
        const userMessages = await processUser(env, address);
        allMessages.push(...userMessages);
      } catch (error) {
        console.error(`Error processing user ${address}:`, error);
        // Continue with other users
      }
    }

    // 3. Send all notifications
    if (allMessages.length > 0) {
      console.log(`Sending ${allMessages.length} notifications`);
      const result = await sendPushNotifications(allMessages);

      // Mark invalid tokens as inactive
      if (result.invalidTokens.length > 0) {
        console.log(`Marking ${result.invalidTokens.length} tokens as inactive`);
        for (const token of result.invalidTokens) {
          await markTokenInactive(env.DB, token);
        }
      }
    }

    console.log('Cron job completed');
  } catch (error) {
    console.error('Cron job error:', error);
  }
}

/**
 * Check for pool-wide block and notify all users
 */
async function checkPoolBlock(env: Env): Promise<ExpoPushMessage[]> {
  const messages: ExpoPushMessage[] = [];

  const poolStatsResult = await getPoolStats(env.PARASITE_API_URL);
  if (!poolStatsResult.success || !poolStatsResult.data) {
    console.log('Failed to fetch pool stats, skipping block check');
    return messages;
  }

  const currentBlockTime = poolStatsResult.data.lastBlockTime;

  // Get stored pool state
  const poolState = await getPoolState(env.DB);
  const storedBlockTime = poolState?.last_block_time;

  // Detect block change (lastBlockTime is now a block height string or null)
  if (
    currentBlockTime != null &&
    currentBlockTime !== storedBlockTime
  ) {
    console.log(`New block detected: ${currentBlockTime}`);

    // Get all active subscriptions with block notifications enabled
    const allSubscriptions = await getAllActiveSubscriptions(env.DB);

    // Group by address to check preferences
    const addressTokens = new Map<string, string[]>();
    for (const sub of allSubscriptions) {
      const tokens = addressTokens.get(sub.btc_address) || [];
      tokens.push(sub.push_token);
      addressTokens.set(sub.btc_address, tokens);
    }

    // Check preferences and create messages
    for (const [address, tokens] of addressTokens) {
      const prefs = await getPreferences(env.DB, address);
      // Default to enabled if no preferences set
      const blocksEnabled = prefs ? prefs.notify_blocks === 1 : true;

      if (blocksEnabled) {
        for (const token of tokens) {
          messages.push(
            createPushMessage(token, 'Block Found!', 'Parasite Pool found a block!', {
              type: 'pool_block',
              blockTime: currentBlockTime,
            })
          );
        }
      }
    }

    // Update stored block time
    await updatePoolState(env.DB, currentBlockTime);
  }

  return messages;
}

/**
 * Process a single user for worker status and difficulty changes
 */
async function processUser(
  env: Env,
  address: string
): Promise<ExpoPushMessage[]> {
  const messages: ExpoPushMessage[] = [];

  // Fetch user data from Parasite Pool
  const userResult = await getUser(env.PARASITE_API_URL, address);
  if (!userResult.success || !userResult.data) {
    console.log(`Failed to fetch user ${address}, skipping`);
    return messages;
  }

  const userData = userResult.data;

  // Get stored state and preferences
  const [userState, prefs, tokens] = await Promise.all([
    getUserState(env.DB, address),
    getPreferences(env.DB, address),
    getActiveTokensByAddress(env.DB, address),
  ]);

  if (tokens.length === 0) {
    return messages; // No active tokens for this user
  }

  const workersEnabled = prefs ? prefs.notify_workers === 1 : true;
  const bestDiffEnabled = prefs ? prefs.notify_best_diff === 1 : true;

  // Parse stored worker statuses
  let storedStatuses: WorkerStatusMap = {};
  if (userState?.worker_statuses) {
    try {
      storedStatuses = JSON.parse(userState.worker_statuses);
    } catch {
      console.warn(`[Cron] Invalid worker_statuses JSON for ${address}`);
    }
  }

  const newStatuses: WorkerStatusMap = {};
  const offlineWorkers: string[] = [];
  const onlineWorkers: string[] = [];

  // Process each worker
  for (const worker of userData.workerData || []) {
    const workerName = worker.name;
    const lastSubmission = parseInt(worker.lastSubmission, 10) || 0;
    const isStale = isWorkerStale(lastSubmission);

    const stored = storedStatuses[workerName] || {
      offlineChecks: 0,
      notifiedOffline: false,
    };

    if (isStale) {
      // Worker is offline
      const newOfflineChecks = stored.offlineChecks + 1;

      if (
        newOfflineChecks >= OFFLINE_CHECK_THRESHOLD &&
        !stored.notifiedOffline
      ) {
        // Time to notify - worker has been offline for 5 minutes
        offlineWorkers.push(workerName);
        newStatuses[workerName] = {
          offlineChecks: newOfflineChecks,
          notifiedOffline: true,
        };
      } else {
        newStatuses[workerName] = {
          offlineChecks: newOfflineChecks,
          notifiedOffline: stored.notifiedOffline,
        };
      }
    } else {
      // Worker is online
      if (stored.notifiedOffline) {
        // Worker came back online after we notified it was offline
        onlineWorkers.push(workerName);
      }
      newStatuses[workerName] = {
        offlineChecks: 0,
        notifiedOffline: false,
      };
    }
  }

  // Create worker status notifications (batched)
  if (workersEnabled) {
    if (offlineWorkers.length > 0) {
      const title =
        offlineWorkers.length === 1 ? 'Worker Offline' : 'Workers Offline';
      const body =
        offlineWorkers.length === 1
          ? `${offlineWorkers[0]} went offline`
          : `${offlineWorkers.length} workers went offline: ${offlineWorkers.join(', ')}`;

      for (const sub of tokens) {
        messages.push(
          createPushMessage(sub.push_token, title, body, {
            type: 'worker_offline',
            workers: offlineWorkers,
          })
        );
      }
    }

    if (onlineWorkers.length > 0) {
      const title =
        onlineWorkers.length === 1 ? 'Worker Online' : 'Workers Online';
      const body =
        onlineWorkers.length === 1
          ? `${onlineWorkers[0]} is back online`
          : `${onlineWorkers.length} workers are back online: ${onlineWorkers.join(', ')}`;

      for (const sub of tokens) {
        messages.push(
          createPushMessage(sub.push_token, title, body, {
            type: 'worker_online',
            workers: onlineWorkers,
          })
        );
      }
    }
  }

  // Check for new best difficulty
  if (bestDiffEnabled) {
    const currentBestDiff = userData.bestDifficulty;
    const storedBestDiff = userState?.best_difficulty;

    if (currentBestDiff && currentBestDiff !== 'N/A') {
      const currentValue = parseDifficulty(currentBestDiff);
      const storedValue = storedBestDiff ? parseDifficulty(storedBestDiff) : 0;

      if (currentValue > storedValue && storedValue > 0) {
        // New personal best (only notify if they had a previous best)
        for (const sub of tokens) {
          messages.push(
            createPushMessage(
              sub.push_token,
              'New Best!',
              `New personal best: ${currentBestDiff}`,
              {
                type: 'best_difficulty',
                difficulty: currentBestDiff,
              }
            )
          );
        }
      }
    }
  }

  // Update stored state
  await upsertUserState(
    env.DB,
    address,
    JSON.stringify(newStatuses),
    userData.bestDifficulty || ''
  );

  return messages;
}
