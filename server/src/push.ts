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
}

/**
 * Send push notifications via Expo Push API
 * Handles batching and returns invalid tokens for cleanup
 */
export async function sendPushNotifications(
  messages: ExpoPushMessage[]
): Promise<SendResult> {
  if (messages.length === 0) {
    return { tickets: [], invalidTokens: [] };
  }

  const allTickets: ExpoPushTicket[] = [];
  const invalidTokens: string[] = [];

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
        continue;
      }

      const result = (await response.json()) as { data: ExpoPushTicket[] };
      const tickets = result.data;

      // Check for invalid tokens
      tickets.forEach((ticket, index) => {
        allTickets.push(ticket);

        if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
        ) {
          const originalMessage = batch[index];
          if (originalMessage) {
            invalidTokens.push(originalMessage.to);
          }
        }
      });
    } catch (error) {
      console.error('Error sending push notifications:', error);
      // Continue with other batches even if one fails
    }
  }

  return { tickets: allTickets, invalidTokens };
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

/**
 * Create push messages for multiple tokens with the same content
 */
export function createBroadcastMessages(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): ExpoPushMessage[] {
  return tokens.map((token) => createPushMessage(token, title, body, data));
}
