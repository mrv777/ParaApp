import { describe, expect, it } from 'vitest';
import type { NotificationTaskPayload } from 'expo-notifications';

import { isWidgetRefreshNotification } from './notificationPayload';

describe('isWidgetRefreshNotification', () => {
  it('accepts Expo dataString payloads', () => {
    expect(
      isWidgetRefreshNotification({
        notification: null,
        data: { dataString: JSON.stringify({ type: 'widget_refresh' }) },
      })
    ).toBe(true);
  });

  it('accepts direct and serialized body payloads', () => {
    expect(
      isWidgetRefreshNotification({
        notification: null,
        data: { type: 'widget_refresh' },
      })
    ).toBe(true);
    expect(
      isWidgetRefreshNotification({
        notification: null,
        data: { body: JSON.stringify({ type: 'widget_refresh' }) },
      })
    ).toBe(true);
  });

  it('rejects visible notifications, malformed data, and action responses', () => {
    expect(
      isWidgetRefreshNotification({
        notification: { title: 'Worker offline' },
        data: { dataString: JSON.stringify({ type: 'widget_refresh' }) },
      })
    ).toBe(false);
    expect(
      isWidgetRefreshNotification({
        notification: null,
        data: { dataString: '{bad json' },
      })
    ).toBe(false);
    const actionResponse = {
      actionIdentifier: 'default',
      notification: {},
    } as unknown as NotificationTaskPayload;
    expect(isWidgetRefreshNotification(actionResponse)).toBe(false);
  });
});
