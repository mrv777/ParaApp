import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { PersonalMiningWidgetSnapshot } from '../types';
import {
  MEDIUM_WIDTH_DP,
  URI_HOME,
  URI_SETTINGS,
  WIDGET_COLORS as C,
  freshnessBadge,
} from './theme';

interface Props {
  snapshot: PersonalMiningWidgetSnapshot;
  width: number;
  now: number;
}

function Label({ text }: { text: string }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      style={{ fontSize: 11, fontWeight: '600', color: C.muted, letterSpacing: 0.5 }}
    />
  );
}

function Value({ text, fontSize = 22 }: { text: string; fontSize?: number }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{ fontSize, fontWeight: 'bold', color: C.text }}
    />
  );
}

function StatusText({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: `#${string}`;
}) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextWidget
        text={String(value)}
        maxLines={1}
        style={{ fontSize: 12, fontWeight: 'bold', color }}
      />
      <TextWidget
        text={` ${label}`}
        maxLines={1}
        style={{ fontSize: 12, fontWeight: '500', color: C.muted }}
      />
    </FlexWidget>
  );
}

export function PersonalMiningAndroidWidget({ snapshot, width, now }: Props) {
  const badge = freshnessBadge(snapshot.fetchedAt, now);
  const isMedium = width >= MEDIUM_WIDTH_DP;
  const targetUri = snapshot.hasAddress ? URI_HOME : URI_SETTINGS;

  const rootStyle = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    flexDirection: 'column' as const,
    justifyContent: 'flex-start' as const,
    backgroundColor: C.bg,
    borderRadius: 16,
    padding: isMedium ? 14 : 10,
  };

  if (!snapshot.hasAddress) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: URI_SETTINGS }}
        style={rootStyle}
      >
        <Label text="PARAAPP" />
        <FlexWidget style={{ height: 8, width: 'match_parent' }} />
        <Value text="Add address" fontSize={18} />
        <TextWidget
          text="Open settings to show your mining stats."
          maxLines={2}
          style={{ fontSize: 12, color: C.muted, marginTop: 4 }}
        />
      </FlexWidget>
    );
  }

  const header = (
    <FlexWidget
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: 'match_parent',
      }}
    >
      <Label text={snapshot.addressLabel} />
      {badge ? (
        <TextWidget
          text={badge}
          maxLines={1}
          style={{ fontSize: 11, fontWeight: '600', color: C.warning }}
        />
      ) : (
        <FlexWidget style={{ width: 0, height: 0 }} />
      )}
    </FlexWidget>
  );

  if (isMedium) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: URI_HOME }}
        style={rootStyle}
      >
        {header}
        <FlexWidget
          style={{ flexDirection: 'row', width: 'match_parent', marginTop: 8 }}
        >
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="NOW" />
            <Value text={snapshot.hashrate} fontSize={24} />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="BEST DIFF" />
            <Value text={snapshot.bestDiff} fontSize={18} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget
          style={{ flexDirection: 'row', width: 'match_parent', marginTop: 8 }}
        >
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="1H AVG" />
            <TextWidget
              text={snapshot.hashrate1h}
              maxLines={1}
              style={{ fontSize: 15, fontWeight: '600', color: C.text }}
            />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="24H AVG" />
            <TextWidget
              text={snapshot.hashrate24h}
              maxLines={1}
              style={{ fontSize: 15, fontWeight: '600', color: C.text }}
            />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="WORKERS" />
            <StatusText label="online" value={snapshot.onlineWorkers} color={C.success} />
            <StatusText label="stale" value={snapshot.staleWorkers} color={C.warning} />
            <StatusText label="offline" value={snapshot.offlineWorkers} color={C.danger} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: targetUri }}
      style={rootStyle}
    >
      {header}
      <FlexWidget style={{ marginTop: 4 }}>
        <Value text={snapshot.hashrate} fontSize={20} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', marginTop: 4 }}>
        <Label text="BEST DIFF" />
        <Value text={snapshot.bestDiff} fontSize={17} />
      </FlexWidget>
      <FlexWidget
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}
      >
        <StatusText label="on" value={snapshot.onlineWorkers} color={C.success} />
        {snapshot.staleWorkers > 0 ? (
          <FlexWidget style={{ flexDirection: 'row', marginLeft: 8 }}>
            <StatusText label="stale" value={snapshot.staleWorkers} color={C.warning} />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ width: 0, height: 0 }} />
        )}
        {snapshot.offlineWorkers > 0 ? (
          <FlexWidget style={{ flexDirection: 'row', marginLeft: 8 }}>
            <StatusText label="off" value={snapshot.offlineWorkers} color={C.danger} />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ width: 0, height: 0 }} />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
