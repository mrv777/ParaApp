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
  DispenserEligibilityResponse,
} from './types';
import {
  getUserState,
  upsertUserState,
  getPoolState,
  updatePoolState,
  getAllActiveSubscriptions,
  getPreferences,
  getAllPreferences,
  markTokenInactive,
  getSubscriptionsDueForWidgetPush,
  markWidgetPushSent,
  upsertWidgetPoolSnapshot,
  upsertWidgetUserSnapshot,
  claimCronTick,
  pruneCronRuns,
} from './db';
import { pruneChatMessages, pruneExpiredBans, pruneAuditLog } from './chat/db';
import {
  getUser,
  getPoolStats,
  getDispenserEligibility,
  getDispenserTiers,
} from './parasite-api';
import {
  sendPushNotifications,
  createPushMessage,
  createSilentWidgetRefreshMessage,
} from './push';
import {
  buildPoolWidgetSnapshot,
  buildUserWidgetSnapshot,
} from './widget-snapshots';

// 5 minutes = 5 cron cycles (1 min each)
const OFFLINE_CHECK_THRESHOLD = 5;
// Worker considered stale if lastSubmission is older than 10 minutes.
// Kept generous because share arrival is probabilistic: low-hashrate miners
// can legitimately go several minutes between shares, and a threshold that's
// too tight produces false offline/online notification pairs.
const STALE_THRESHOLD_SECONDS = 600;
// Blanket fallback: how often a quiet device gets a silent widget refresh even
// when nothing changed. Kept well within Apple's content-available budget
// (only a handful/day deliver reliably); real freshness comes from the
// event-driven refreshes below.
const WIDGET_PUSH_INTERVAL_SECONDS = 2 * 60 * 60;
// Per-device floor between event-driven widget refreshes, capped at two/hour
// to stay within Apple's recommended background-notification budget.
const WIDGET_EVENT_MIN_INTERVAL_SECONDS = 30 * 60;
// Community chat: rolling 30-day message retention.
const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Admin audit trail: keep 90 days.
const CHAT_AUDIT_RETENTION_SEC = 90 * 24 * 60 * 60;
// Production has 300+ active addresses; sequential processing was observed
// spanning 61 seconds, long enough to overlap the next one-minute tick.
const USER_BATCH_SIZE = 6;
const CRON_USER_TIMEOUT_MS = 5000;
// Each address's dispenser eligibility is checked every Nth tick (rotating
// shard), not every minute: reward assignment is rare and a few minutes of
// latency is invisible, while a per-tick check would double the per-address
// subrequest fan-out and halve the ~1000-address subrequest ceiling.
const DISPENSER_CHECK_INTERVAL_TICKS = 5;
const CRON_USER_DEADLINE_MS = 45_000;
const CRON_DURATION_WARNING_MS = 52_000;

interface CronSummaryInput {
  scheduledTime: number;
  durationMs: number;
  totalAddresses: number;
  attemptedAddresses: number;
  updatedAddresses: number;
  userFailures: number;
  deadlineReached: boolean;
  notificationsQueued: number;
  pushFailures: number;
  invalidTokens: number;
  claimFailed: boolean;
  maintenanceFailures: number;
  duplicateTick?: boolean;
  topLevelError?: boolean;
}

export interface CronSummary extends CronSummaryInput {
  message: 'cron_summary';
  coverageTicks: number | null;
  warningReasons: string[];
}

/** Build the stable, non-sensitive payload emitted once per cron invocation. */
export function buildCronSummary(input: CronSummaryInput): CronSummary {
  const coverageTicks =
    input.totalAddresses === 0
      ? 0
      : input.updatedAddresses > 0
        ? Math.ceil(input.totalAddresses / input.updatedAddresses)
        : null;
  const warningReasons: string[] = [];

  if (input.topLevelError) warningReasons.push('top_level_error');
  if (input.claimFailed) warningReasons.push('tick_claim_failed');
  if (input.maintenanceFailures > 0) {
    warningReasons.push('maintenance_failures');
  }
  if (input.durationMs > CRON_DURATION_WARNING_MS) {
    warningReasons.push('duration_over_52s');
  }
  if (input.totalAddresses > 0 && input.updatedAddresses === 0) {
    warningReasons.push('no_user_updates');
  } else if (coverageTicks !== null && coverageTicks > 2) {
    warningReasons.push('coverage_over_two_ticks');
  }
  if (input.userFailures > 0) warningReasons.push('user_failures');
  if (input.pushFailures > 0) warningReasons.push('push_failures');

  return {
    message: 'cron_summary',
    ...input,
    coverageTicks,
    warningReasons,
  };
}

function logCronSummary(input: CronSummaryInput): void {
  const summary = buildCronSummary(input);
  const serialized = JSON.stringify(summary);
  if (input.topLevelError) console.error(serialized);
  else if (summary.warningReasons.length > 0) console.warn(serialized);
  else console.log(serialized);
}

function greatestCommonDivisor(a: number, b: number): number {
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return Math.abs(a);
}

/**
 * Pick a widely-spaced start position that still visits every possible offset
 * exactly once per `addressCount` ticks. A dynamically coprime stride avoids
 * both stable-tail starvation and fixed-stride cycles when the count changes.
 */
export function getUserRotationOffset(
  scheduledTime: number,
  addressCount: number
): number {
  if (addressCount <= 1) return 0;
  let stride = Math.max(1, Math.floor(addressCount / 2));
  while (greatestCommonDivisor(stride, addressCount) !== 1) stride++;
  const tick = Math.floor(scheduledTime / 60_000) % addressCount;
  return (tick * stride) % addressCount;
}

/**
 * Deterministic rotating shard for dispenser checks: each address hashes to a
 * fixed slot in [0, DISPENSER_CHECK_INTERVAL_TICKS) and is checked on the ticks
 * whose minute index lands on that slot — every address exactly once per
 * interval, ~1/N of them per tick.
 */
export function shouldCheckDispenser(
  address: string,
  scheduledTime: number
): boolean {
  const tick = Math.floor(scheduledTime / 60_000);
  let hash = 5381;
  for (let i = 0; i < address.length; i++) {
    hash = (Math.imul(hash, 33) ^ address.charCodeAt(i)) >>> 0;
  }
  return (
    tick % DISPENSER_CHECK_INTERVAL_TICKS ===
    hash % DISPENSER_CHECK_INTERVAL_TICKS
  );
}

/** Per-tier assigned-slot counts (override slots under the `__override` key). */
export type DispenserSlotCounts = Record<string, number>;

/**
 * Collapse an eligibility payload to per-tier assigned-slot counts. Only tiers
 * with at least one assigned inscription appear; tier_shares without an
 * assignment (e.g. exhausted asset pool) are deliberately excluded — a reward
 * only counts once there is actually something to claim.
 */
export function buildDispenserCounts(
  data: DispenserEligibilityResponse
): DispenserSlotCounts {
  const counts: DispenserSlotCounts = {};
  for (const [tier, ids] of Object.entries(data.assigned_inscription_ids ?? {})) {
    if (Array.isArray(ids) && ids.length > 0) counts[tier] = ids.length;
  }
  if (typeof data.override_slots === 'number' && data.override_slots > 0) {
    counts.__override = data.override_slots;
  }
  return counts;
}

/**
 * Diff current dispenser slot counts against the stored watermark.
 *
 * Watermark semantics — the stored count per tier only ever rises: a tier that
 * flaps low (partial payload, dispenser glitch) and recovers must not re-fire,
 * and a tier disappearing (ended campaign) must not mask a genuine increase in
 * another tier. First observation (no stored state, including unparseable
 * state) establishes a baseline and never notifies — otherwise every existing
 * slot-holder would be alerted the first time this runs.
 */
export function diffDispenserRewards(
  storedJson: string | null | undefined,
  current: DispenserSlotCounts
): { newSlots: { tier: string; count: number }[]; nextState: string } {
  let stored: DispenserSlotCounts | null = null;
  if (storedJson) {
    try {
      const parsed = JSON.parse(storedJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        stored = parsed as DispenserSlotCounts;
      }
    } catch {
      // fall through to baseline
    }
  }

  const watermark: DispenserSlotCounts = { ...(stored ?? {}) };
  const newSlots: { tier: string; count: number }[] = [];
  for (const [tier, count] of Object.entries(current)) {
    const prev = typeof watermark[tier] === 'number' ? watermark[tier] : 0;
    if (count > prev) {
      if (stored !== null) newSlots.push({ tier, count: count - prev });
      watermark[tier] = count;
    }
  }
  return { newSlots, nextState: JSON.stringify(watermark) };
}

/**
 * Whether a subscription should receive an event-driven silent widget refresh
 * right now: widgets enabled, and not already pushed within
 * WIDGET_EVENT_MIN_INTERVAL_SECONDS.
 */
function isWidgetEventEligible(
  sub: PushSubscription,
  nowSeconds: number
): boolean {
  if (sub.widget_updates_enabled !== 1) return false;
  if (sub.last_widget_push_at == null) return true;
  return sub.last_widget_push_at <= nowSeconds - WIDGET_EVENT_MIN_INTERVAL_SECONDS;
}

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
 * True only when `current` is a strictly newer block than `stored`.
 *
 * Block heights are numeric strings, so we compare numerically: a height that
 * stays the same or moves backwards (reorg, API cache flap, transient blip) is
 * never "a new block" and must not fire a "Block Found!" alert. Falls back to a
 * plain inequality when either value isn't a clean integer, so an unexpected
 * format change surfaces as an alert rather than silently going dark.
 */
function isNewerBlock(
  current: string,
  stored: string | null | undefined
): boolean {
  if (stored == null) return true;
  const c = Number(current);
  const s = Number(stored);
  if (Number.isInteger(c) && Number.isInteger(s)) return c > s;
  return current !== stored;
}

/**
 * Main cron job entry point
 */
export async function runCronJob(env: Env, scheduledTime: number): Promise<void> {
  const runStartedAt = Date.now();
  let totalAddresses = 0;
  let attemptedAddresses = 0;
  let updatedAddresses = 0;
  let userFailures = 0;
  let deadlineReached = false;
  let notificationsQueued = 0;
  let pushFailures = 0;
  let invalidTokens = 0;
  let claimFailed = false;
  let maintenanceFailures = 0;
  let topLevelError = false;
  console.log('Cron job started');

  // Single-flight: a duplicate dispatch of this same scheduled tick shares
  // `scheduledTime`, so only the first caller wins the claim. The loser bails to
  // avoid duplicate notifications. Fails OPEN — a lock-table hiccup must never
  // drop a real cron cycle (the per-block claim still de-dups block alerts).
  try {
    const claimed = await claimCronTick(env.DB, scheduledTime);
    if (!claimed) {
      console.log(
        `Cron tick ${scheduledTime} already claimed, skipping duplicate dispatch`
      );
      logCronSummary({
        scheduledTime,
        durationMs: Date.now() - runStartedAt,
        totalAddresses,
        attemptedAddresses,
        updatedAddresses,
        userFailures,
        deadlineReached,
        notificationsQueued,
        pushFailures,
        invalidTokens,
        claimFailed,
        maintenanceFailures,
        duplicateTick: true,
      });
      return;
    }
    // Keep the lock table bounded; one row per minute otherwise grows forever.
    await pruneCronRuns(env.DB, scheduledTime - 60 * 60 * 1000);
  } catch (error) {
    claimFailed = true;
    console.error('Cron tick claim error, proceeding anyway:', error);
  }

  // Community-chat retention: prune messages (+ their reactions) older than 30
  // days. Cheap when nothing is due (created_at indexed); isolated so a failure
  // never blocks notifications.
  try {
    const pruned = await pruneChatMessages(env.DB, Date.now() - CHAT_RETENTION_MS);
    if (pruned > 0) console.log(`Pruned ${pruned} chat messages (30d retention)`);
    const bans = await pruneExpiredBans(env.DB);
    if (bans > 0) console.log(`Reaped ${bans} expired chat bans`);
    const audit = await pruneAuditLog(
      env.DB,
      Math.floor(Date.now() / 1000) - CHAT_AUDIT_RETENTION_SEC
    );
    if (audit > 0) console.log(`Pruned ${audit} chat audit entries (90d retention)`);
  } catch (error) {
    maintenanceFailures++;
    console.error('Chat retention prune error:', error);
  }

  const allMessages: ExpoPushMessage[] = [];
  // Tokens to refresh because their underlying data actually changed this cycle.
  const eventWidgetTokens = new Set<string>();

  try {
    // 1. Check for pool-wide block detection
    const blockResult = await checkPoolBlock(env);
    allMessages.push(...blockResult.messages);
    for (const token of blockResult.widgetTokens) eventWidgetTokens.add(token);

    // 2. Process each user for worker/difficulty changes.
    //    Load every active subscription in ONE scan and group by address in
    //    memory, then reuse those rows as each address's tokens. The previous
    //    approach did a DISTINCT scan plus a per-address token lookup, and that
    //    per-address query mis-planned onto the low-cardinality `active` index —
    //    re-reading every active row for every address (O(addresses × subs)),
    //    which dominated D1 row-reads. Grouping makes it a single O(subs) scan.
    const activeSubscriptions = await getAllActiveSubscriptions(env.DB);
    const subsByAddress = new Map<string, PushSubscription[]>();
    for (const sub of activeSubscriptions) {
      const list = subsByAddress.get(sub.btc_address);
      if (list) list.push(sub);
      else subsByAddress.set(sub.btc_address, [sub]);
    }
    console.log(`Processing ${subsByAddress.size} unique addresses`);

    // Rotate the first address every tick so an upstream outage plus deadline
    // cannot starve the same stable tail forever. Six concurrent users match
    // Cloudflare's documented simultaneous outgoing-connection cap.
    const entries = [...subsByAddress.entries()];
    totalAddresses = entries.length;
    const offset = getUserRotationOffset(scheduledTime, entries.length);
    const orderedEntries = entries.slice(offset).concat(entries.slice(0, offset));

    // Tier → asset names for reward notification bodies. One subrequest, only
    // when at least one address is in this tick's dispenser shard; failure just
    // degrades to a generic message.
    let tierAssets: Map<string, string> | null = null;
    if (entries.some(([address]) => shouldCheckDispenser(address, scheduledTime))) {
      const tiersResult = await getDispenserTiers(env.PARASITE_API_URL);
      if (tiersResult.success && Array.isArray(tiersResult.data)) {
        tierAssets = new Map(
          tiersResult.data.map((tier) => [tier.name, tier.asset])
        );
      }
    }

    for (let i = 0; i < orderedEntries.length; i += USER_BATCH_SIZE) {
      if (Date.now() - runStartedAt >= CRON_USER_DEADLINE_MS) {
        deadlineReached = true;
        break;
      }

      const batch = orderedEntries.slice(i, i + USER_BATCH_SIZE);
      attemptedAddresses += batch.length;
      const results = await Promise.allSettled(
        batch.map(([address, tokens]) =>
          processUser(env, address, tokens, {
            checkDispenser: shouldCheckDispenser(address, scheduledTime),
            tierAssets,
          })
        )
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const address = batch[j][0];
        if (result.status === 'rejected') {
          userFailures++;
          console.error(`Error processing user ${address}:`, result.reason);
          continue;
        }
        if (result.value.stateUpdated) updatedAddresses++;
        else userFailures++;
        allMessages.push(...result.value.messages);
        for (const token of result.value.widgetTokens) {
          eventWidgetTokens.add(token);
        }
      }
    }

    // 3. Widget refreshes: event-driven (data changed) + blanket fallback.
    //    De-dupe so a token that's both due for the fallback and changed this
    //    cycle still receives exactly one silent push.
    const blanketMessages = await buildWidgetRefreshMessages(env);
    const blanketTokens = new Set(blanketMessages.map((message) => message.to));
    const eventOnlyTokens = [...eventWidgetTokens].filter(
      (token) => !blanketTokens.has(token)
    );
    const widgetMessages = [
      ...blanketMessages,
      ...eventOnlyTokens.map((token) => createSilentWidgetRefreshMessage(token)),
    ];
    allMessages.push(...widgetMessages);
    notificationsQueued = allMessages.length;

    if (allMessages.length > 0) {
      console.log(`Sending ${allMessages.length} notifications`);
      const result = await sendPushNotifications(allMessages);
      pushFailures = result.failedTokens.length;
      invalidTokens = result.invalidTokens.length;

      // Mark invalid tokens as inactive
      if (result.invalidTokens.length > 0) {
        console.log(`Marking ${result.invalidTokens.length} tokens as inactive`);
        for (const token of result.invalidTokens) {
          await markTokenInactive(env.DB, token);
        }
      }

      // Only advance last_widget_push_at for tokens Expo actually accepted.
      // Tokens whose submission failed this cycle stay "due" so the fallback
      // retries them — silent refreshes are idempotent, so at worst a token
      // that did send refreshes again, never one that's suppressed for ~2h.
      const failedTokens = new Set(result.failedTokens);
      const widgetTokens = [...blanketTokens, ...eventOnlyTokens].filter(
        (token) => !failedTokens.has(token)
      );
      if (widgetTokens.length > 0) {
        await markWidgetPushSent(env.DB, widgetTokens);
      }
    }

  } catch (error) {
    topLevelError = true;
    console.error('Cron job error:', error);
  } finally {
    const durationMs = Date.now() - runStartedAt;
    logCronSummary({
      scheduledTime,
      durationMs,
      totalAddresses,
      attemptedAddresses,
      updatedAddresses,
      userFailures,
      deadlineReached,
      notificationsQueued,
      pushFailures,
      invalidTokens,
      claimFailed,
      maintenanceFailures,
      topLevelError,
    });
    console.log(`Cron job completed in ${durationMs}ms`);
  }
}

/**
 * Check for pool-wide block and notify all users
 */
async function checkPoolBlock(
  env: Env
): Promise<{ messages: ExpoPushMessage[]; widgetTokens: string[] }> {
  const messages: ExpoPushMessage[] = [];
  const widgetTokens: string[] = [];

  const poolStatsResult = await getPoolStats(env.PARASITE_API_URL);
  if (!poolStatsResult.success || !poolStatsResult.data) {
    console.log('Failed to fetch pool stats, skipping block check');
    return { messages, widgetTokens };
  }

  const currentBlockTime = poolStatsResult.data.lastBlockTime;
  const fetchedAt = Date.now();
  await upsertWidgetPoolSnapshot(
    env.DB,
    JSON.stringify(buildPoolWidgetSnapshot(poolStatsResult.data, fetchedAt)),
    fetchedAt
  );

  // Get stored pool state
  const poolState = await getPoolState(env.DB);
  const storedBlockTime = poolState?.last_block_time;

  // Detect a genuinely newer block (height strictly increased). lastBlockTime is
  // a block height string or null; reorgs / flapping must not trigger alerts.
  if (
    currentBlockTime != null &&
    isNewerBlock(currentBlockTime, storedBlockTime)
  ) {
    // Atomically claim the block before doing any work. If another (concurrent
    // or double-dispatched) cron run already advanced the stored block time,
    // we lose the claim and bail out — that other run sends the alerts, so
    // every device is notified exactly once instead of twice.
    const claimed = await updatePoolState(env.DB, currentBlockTime);
    if (!claimed) {
      console.log(
        `New block ${currentBlockTime} already claimed by another run, skipping`
      );
      return { messages, widgetTokens };
    }

    console.log(`New block detected: ${currentBlockTime}`);

    // Get all active subscriptions with block notifications enabled
    const allSubscriptions = await getAllActiveSubscriptions(env.DB);

    // Group by address to check per-address block preference. Keep the full
    // subscription rows so we can also honor each device's per-token master
    // notifications flag below.
    const addressSubs = new Map<string, PushSubscription[]>();
    for (const sub of allSubscriptions) {
      const subs = addressSubs.get(sub.btc_address) || [];
      subs.push(sub);
      addressSubs.set(sub.btc_address, subs);
    }

    // Check preferences and create messages. Load the small table once instead
    // of issuing one D1 query per address on the relatively rare block tick.
    const prefsByAddress = new Map(
      (await getAllPreferences(env.DB)).map((prefs) => [prefs.btc_address, prefs])
    );
    for (const [address, subs] of addressSubs) {
      const prefs = prefsByAddress.get(address);
      // Default to enabled if no preferences set
      const blocksEnabled = prefs ? prefs.notify_blocks === 1 : true;

      if (blocksEnabled) {
        for (const sub of subs) {
          if (sub.notifications_enabled !== 1) continue;
          messages.push(
            createPushMessage(sub.push_token, 'Block Found!', 'Parasite Pool found a block!', {
              type: 'pool_block',
              blockTime: currentBlockTime,
            })
          );
        }
      }
    }

    // Nudge widget-enabled devices to refresh (independent of the block-alert
    // preference — a fresh block changes the pool widget regardless).
    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const sub of allSubscriptions) {
      if (isWidgetEventEligible(sub, nowSeconds)) {
        widgetTokens.push(sub.push_token);
      }
    }
  }

  return { messages, widgetTokens };
}

/**
 * Process a single user for worker status and difficulty changes
 */
async function processUser(
  env: Env,
  address: string,
  tokens: PushSubscription[],
  dispenser: {
    checkDispenser: boolean;
    tierAssets: Map<string, string> | null;
  }
): Promise<{
  messages: ExpoPushMessage[];
  widgetTokens: string[];
  stateUpdated: boolean;
}> {
  const messages: ExpoPushMessage[] = [];
  const widgetTokens: string[] = [];

  if (tokens.length === 0) {
    return { messages, widgetTokens, stateUpdated: false }; // Defensive only
  }

  // Fetch user data from Parasite Pool (and, on this address's dispenser tick,
  // its eligibility in parallel so the 45s deadline budget barely moves)
  const [userResult, eligibilityResult] = await Promise.all([
    getUser(env.PARASITE_API_URL, address, CRON_USER_TIMEOUT_MS),
    dispenser.checkDispenser
      ? getDispenserEligibility(env.PARASITE_API_URL, address, CRON_USER_TIMEOUT_MS)
      : Promise.resolve(null),
  ]);
  if (!userResult.success || !userResult.data) {
    console.log(`Failed to fetch user ${address}, skipping`);
    return { messages, widgetTokens, stateUpdated: false };
  }

  const userData = userResult.data;
  if (
    !Array.isArray(userData.workerData) ||
    !Number.isFinite(userData.workers) ||
    typeof userData.bestDifficulty !== 'string' ||
    (userData.workers > 0 && userData.workerData.length === 0)
  ) {
    console.warn(`Partial user payload for ${address}, preserving stored state`);
    return { messages, widgetTokens, stateUpdated: false };
  }
  const fetchedAt = Date.now();
  await upsertWidgetUserSnapshot(
    env.DB,
    address,
    JSON.stringify(buildUserWidgetSnapshot(address, userData, fetchedAt)),
    fetchedAt
  );

  // Get stored state and preferences (tokens were grouped from the single
  // active-subscription scan in runCronJob, so no per-address token query here).
  const [userState, prefs] = await Promise.all([
    getUserState(env.DB, address),
    getPreferences(env.DB, address),
  ]);

  const workersEnabled = prefs ? prefs.notify_workers === 1 : true;
  const bestDiffEnabled = prefs ? prefs.notify_best_diff === 1 : true;
  // Rows predating migration 0012 have notify_rewards NULL — treat as enabled,
  // matching the column default.
  const rewardsEnabled = prefs ? prefs.notify_rewards !== 0 : true;

  // Dispenser reward diff. 404 = known zero-slot state (valid baseline); any
  // other failure preserves the stored watermark (dispenserState stays null so
  // the upsert's COALESCE keeps it) and sends nothing.
  let dispenserState: string | null = null;
  if (eligibilityResult) {
    const knownEmpty =
      !eligibilityResult.success && eligibilityResult.status === 404;
    if ((eligibilityResult.success && eligibilityResult.data) || knownEmpty) {
      const counts = eligibilityResult.success
        ? buildDispenserCounts(eligibilityResult.data ?? {})
        : {};
      const { newSlots, nextState } = diffDispenserRewards(
        userState?.dispenser_state,
        counts
      );
      dispenserState = nextState;

      if (rewardsEnabled && newSlots.length > 0) {
        const total = newSlots.reduce((sum, slot) => sum + slot.count, 0);
        const assetNames = [
          ...new Set(
            newSlots
              .filter((slot) => slot.tier !== '__override')
              .map((slot) => dispenser.tierAssets?.get(slot.tier))
              .filter((name): name is string => Boolean(name))
          ),
        ];
        const title =
          total === 1 ? 'Mining Reward Earned!' : 'Mining Rewards Earned!';
        const body =
          total === 1
            ? assetNames.length === 1
              ? `You earned a mining reward: ${assetNames[0]}. Claim it on parasite.space`
              : 'You earned a mining reward! Claim it on parasite.space'
            : `You earned ${total} mining rewards! Claim them on parasite.space`;
        for (const sub of tokens) {
          if (sub.notifications_enabled !== 1) continue;
          messages.push(
            createPushMessage(sub.push_token, title, body, {
              type: 'dispenser_reward',
              count: total,
            })
          );
        }
      }
    }
  }

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
        // Time to notify - worker has been stale for 5 consecutive checks
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
        if (sub.notifications_enabled !== 1) continue;
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
        if (sub.notifications_enabled !== 1) continue;
        messages.push(
          createPushMessage(sub.push_token, title, body, {
            type: 'worker_online',
            workers: onlineWorkers,
          })
        );
      }
    }
  }

  // Detect a new personal best independent of the alert preference, so the
  // widget can still refresh even when best-diff alerts are turned off.
  let newBestDiff = false;
  const currentBestDiff = userData.bestDifficulty;
  if (currentBestDiff && currentBestDiff !== 'N/A') {
    const currentValue = parseDifficulty(currentBestDiff);
    const storedValue = userState?.best_difficulty
      ? parseDifficulty(userState.best_difficulty)
      : 0;
    // Only count it as new if they had a previous best.
    newBestDiff = currentValue > storedValue && storedValue > 0;
  }

  if (bestDiffEnabled && newBestDiff) {
    for (const sub of tokens) {
      if (sub.notifications_enabled !== 1) continue;
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

  // Refresh this user's widget when their data actually changed.
  const dataChanged =
    offlineWorkers.length > 0 || onlineWorkers.length > 0 || newBestDiff;
  if (dataChanged) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const sub of tokens) {
      if (isWidgetEventEligible(sub, nowSeconds)) {
        widgetTokens.push(sub.push_token);
      }
    }
  }

  // Update stored state
  await upsertUserState(
    env.DB,
    address,
    JSON.stringify(newStatuses),
    userData.bestDifficulty || '',
    dispenserState
  );

  return { messages, widgetTokens, stateUpdated: true };
}

async function buildWidgetRefreshMessages(env: Env): Promise<ExpoPushMessage[]> {
  const subscriptions = await getSubscriptionsDueForWidgetPush(
    env.DB,
    WIDGET_PUSH_INTERVAL_SECONDS
  );
  return subscriptions.map((subscription) =>
    createSilentWidgetRefreshMessage(subscription.push_token)
  );
}
