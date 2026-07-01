/**
 * Expo Push API client for sending notifications
 * Direct fetch implementation (no SDK required)
 */

import type { ExpoPushMessage, ExpoPushTicket } from './types';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo recommends max 100 messages per request

export interface SendResult {
  tickets: ExpoPushTicket[];
  invalidTokens: string[]; // Tokens that returned DeviceNotRegistered
  // Tokens whose message was NOT accepted by Expo this call — either the whole
  // batch failed to submit (network/HTTP error) or the ticket came back with
  // status 'error'. Callers that gate follow-up work on successful delivery
  // (e.g. widget last-pushed bookkeeping) should skip these and retry later.
  failedTokens: string[];
}

/**
 * Send push notifications via Expo Push API
 * Handles batching and returns invalid tokens for cleanup
 */
export async function sendPushNotifications(
  messages: ExpoPushMessage[]
): Promise<SendResult> {
  if (messages.length === 0) {
    return { tickets: [], invalidTokens: [], failedTokens: [] };
  }

  const allTickets: ExpoPushTicket[] = [];
  const invalidTokens: string[] = [];
  const failedTokens: string[] = [];

  // Process in batches
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error(
          `Expo Push API error: ${response.status} ${response.statusText}`
        );
        // Whole batch never reached Expo — none of these tokens were accepted.
        for (const message of batch) failedTokens.push(message.to);
        continue;
      }

      const result = (await response.json()) as { data: ExpoPushTicket[] };
      const tickets = result.data;

      // Check ticket-level status per message.
      tickets.forEach((ticket, index) => {
        allTickets.push(ticket);

        const originalMessage = batch[index];
        if (!originalMessage) return;

        if (ticket.status === 'error') {
          // Not accepted — record as failed so callers can retry later. Also
          // surface DeviceNotRegistered separately for token cleanup.
          failedTokens.push(originalMessage.to);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(originalMessage.to);
          }
        }
      });

      // Fewer tickets than messages (malformed/truncated response): treat the
      // unmatched tail as not-accepted rather than silently assuming success.
      for (let j = tickets.length; j < batch.length; j++) {
        failedTokens.push(batch[j].to);
      }
    } catch (error) {
      console.error('Error sending push notifications:', error);
      // Batch threw before we got tickets — none accepted.
      for (const message of batch) failedTokens.push(message.to);
      // Continue with other batches even if one fails
    }
  }

  return { tickets: allTickets, invalidTokens, failedTokens };
}

/**
 * Create a push message for a single token
 */
export function createPushMessage(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): ExpoPushMessage {
  return {
    to: token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    data,
  };
}

export function createSilentWidgetRefreshMessage(token: string): ExpoPushMessage {
  return {
    to: token,
    priority: 'normal',
    data: { type: 'widget_refresh' },
    _contentAvailable: true,
  };
}
