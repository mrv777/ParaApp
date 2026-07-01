import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { PoolOverviewWidgetSnapshot } from '../types';
import {
  MEDIUM_WIDTH_DP,
  URI_POOL,
  WIDGET_COLORS as C,
  freshnessBadge,
} from './theme';

interface Props {
  snapshot: PoolOverviewWidgetSnapshot;
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
      <Label text={label} />
      <TextWidget
        text={value}
        maxLines={1}
        style={{ fontSize: 14, fontWeight: 'bold', color: C.text }}
      />
    </FlexWidget>
  );
}

export function PoolOverviewAndroidWidget({ snapshot, width, now }: Props) {
  const badge = freshnessBadge(snapshot.fetchedAt, now);
  const isMedium = width >= MEDIUM_WIDTH_DP;
  const blockValue =
    snapshot.lastBlock !== '--' && snapshot.lastBlock.length <= 9
      ? snapshot.lastBlock
      : '--';

  const rootStyle = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    flexDirection: 'column' as const,
    justifyContent: 'flex-start' as const,
    backgroundColor: C.bg,
    borderRadius: 16,
    padding: isMedium ? 14 : 10,
  };

  const header = (
    <FlexWidget
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: 'match_parent',
      }}
    >
      <Label text="PARASITE POOL" />
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
        clickActionData={{ uri: URI_POOL }}
        style={rootStyle}
      >
        {header}
        <FlexWidget
          style={{ flexDirection: 'row', width: 'match_parent', marginTop: 8 }}
        >
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="HASHRATE" />
            <Value text={snapshot.poolHashrate} fontSize={24} />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <Label text="BEST DIFF" />
            <Value text={snapshot.highestDiff} fontSize={18} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget
          style={{ flexDirection: 'row', width: 'match_parent', marginTop: 8 }}
        >
          <Metric label="USERS" value={snapshot.users} />
          <Metric label="WORKERS" value={snapshot.workers} />
          <Metric label="BLOCK" value={blockValue} />
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: URI_POOL }}
      style={rootStyle}
    >
      {header}
      <FlexWidget style={{ marginTop: 4 }}>
        <Value text={snapshot.poolHashrate} fontSize={20} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', marginTop: 4 }}>
        <Label text="BEST DIFF" />
        <Value text={snapshot.highestDiff} fontSize={18} />
      </FlexWidget>
    </FlexWidget>
  );
}
