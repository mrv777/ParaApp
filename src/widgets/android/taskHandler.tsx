import React from 'react';
import type {
  WidgetInfo,
  WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { POOL_WIDGET_NAME } from '../types';
import { fetchServerWidgetSnapshots } from '../updater';
import { PersonalMiningAndroidWidget } from './PersonalMiningAndroidWidget';
import { PoolOverviewAndroidWidget } from './PoolOverviewAndroidWidget';
import {
  getPersonalSnapshot,
  getPoolSnapshot,
  setPersonalSnapshot,
  setPoolSnapshot,
} from './storage';

// Hard cap for the WIDGET_UPDATE self-fetch. The two widget endpoints are fetched
// sequentially and each carries ~10s timeout + 1 retry, so an outer race is needed
// to guarantee the headless handler always resolves. 8s allows one real round-trip;
// this runs off the UI thread, so there is no ANR risk. On timeout we fall through
// to the stored snapshot.
const SELF_FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('widget self-fetch timeout')), ms)
    ),
  ]);
}

// Best-effort: pull fresh server snapshots and persist them for renderWidgetForInfo
// to read. Never throws — on network failure / timeout / unsupported headless fetch,
// the last stored snapshot is left in place and the caller renders that instead.
async function refreshStoredSnapshots(): Promise<void> {
  try {
    const { pool, personal } = await withTimeout(
      fetchServerWidgetSnapshots(),
      SELF_FETCH_TIMEOUT_MS
    );
    if (pool) await setPoolSnapshot(pool);
    if (personal) await setPersonalSnapshot(personal);
  } catch {
    // Keep the last stored snapshot.
  }
}

// Render the current stored snapshot for a given placed widget. Shared by the
// task handler (system events) and updater.ts requestWidgetUpdate (app pushes).
export async function renderWidgetForInfo(
  info: WidgetInfo
): Promise<React.JSX.Element> {
  const now = Date.now();
  if (info.widgetName === POOL_WIDGET_NAME) {
    const snapshot = await getPoolSnapshot();
    return (
      <PoolOverviewAndroidWidget snapshot={snapshot} width={info.width} now={now} />
    );
  }
  const snapshot = await getPersonalSnapshot();
  return (
    <PersonalMiningAndroidWidget snapshot={snapshot} width={info.width} now={now} />
  );
}

export async function widgetTaskHandler(
  props: WidgetTaskHandlerProps
): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;

  switch (widgetAction) {
    case 'WIDGET_UPDATE':
      // Periodic (~30 min via updatePeriodMillis). Refresh data even if the app is
      // never opened, then draw from the freshly-stored snapshot.
      await refreshStoredSnapshots();
      renderWidget(await renderWidgetForInfo(widgetInfo));
      break;
    case 'WIDGET_ADDED':
      // Paint instantly from storage so the new widget never shows blank, then
      // upgrade to fresh data if the best-effort fetch succeeds (else re-shows the
      // same stored snapshot — harmless).
      renderWidget(await renderWidgetForInfo(widgetInfo));
      await refreshStoredSnapshots();
      renderWidget(await renderWidgetForInfo(widgetInfo));
      break;
    case 'WIDGET_RESIZED':
      // Frequent and latency-sensitive — render stored immediately, no network.
      renderWidget(await renderWidgetForInfo(widgetInfo));
      break;
    case 'WIDGET_CLICK':
      // Deep links are handled natively via OPEN_URI clickAction; nothing to do.
      break;
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
