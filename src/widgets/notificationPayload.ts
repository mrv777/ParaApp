import type { NotificationTaskPayload } from 'expo-notifications';

function hasWidgetRefreshType(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'widget_refresh'
  );
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * Expo SDK 56 supplies custom push data as `data.dataString` on both platforms
 * (and may also retain the serialized `body`). Accept the direct shape too so
 * this remains safe across Expo serializer changes. Notification action taps
 * and visible worker/block notifications must never wake the widget network path.
 */
export function isWidgetRefreshNotification(
  payload: NotificationTaskPayload
): boolean {
  if ('actionIdentifier' in payload) return false;
  // Expo sets this to null only for a headless/data-only notification. Never
  // let a visible notification share the widget execution path, regardless of
  // any custom data attached to it.
  if (payload.notification !== null) return false;

  const data = payload.data;
  return (
    hasWidgetRefreshType(data) ||
    hasWidgetRefreshType(parseJsonObject(data.dataString)) ||
    hasWidgetRefreshType(parseJsonObject(data.body))
  );
}
