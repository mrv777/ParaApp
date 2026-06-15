import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  allowsTightening,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import {
  PERSONAL_WIDGET_NAME,
  POOL_WIDGET_NAME,
  type PersonalMiningWidgetSnapshot,
  type PoolOverviewWidgetSnapshot,
} from './types';

const INITIAL_PERSONAL_SNAPSHOT: PersonalMiningWidgetSnapshot = {
  kind: 'personal',
  hasAddress: false,
  addressLabel: 'Add address',
  hashrate: '-- H/s',
  hashrate1h: '-- H/s',
  hashrate24h: '-- H/s',
  workerCount: 0,
  onlineWorkers: 0,
  staleWorkers: 0,
  offlineWorkers: 0,
  bestDiff: '--',
  lastSubmission: '--',
  fetchedAt: 0,
  source: 'placeholder',
};

const INITIAL_POOL_SNAPSHOT: PoolOverviewWidgetSnapshot = {
  kind: 'pool',
  poolHashrate: '-- H/s',
  users: '--',
  workers: '--',
  highestDiff: '--',
  lastBlock: '--',
  fetchedAt: 0,
  source: 'placeholder',
};

type PartialPersonalSnapshot = Partial<PersonalMiningWidgetSnapshot>;
type PartialPoolSnapshot = Partial<PoolOverviewWidgetSnapshot>;

export const personalMiningWidget = createWidget<PartialPersonalSnapshot>(
  PERSONAL_WIDGET_NAME,
  (rawProps, env: WidgetEnvironment) => {
    'widget';

    const BG = '#0a0a0a';
    const TEXT = '#ededed';
    const MUTED = '#8a8a8a';
    const SUCCESS = '#22c55e';
    const WARNING = '#facc15';
    const DANGER = '#ef4444';
    const STALE_AFTER_MS = 60 * 60 * 1000;

    const props = {
      kind: 'personal',
      hasAddress: false,
      addressLabel: 'Add address',
      hashrate: '-- H/s',
      hashrate1h: '-- H/s',
      hashrate24h: '-- H/s',
      workerCount: 0,
      onlineWorkers: 0,
      staleWorkers: 0,
      offlineWorkers: 0,
      bestDiff: '--',
      lastSubmission: '--',
      fetchedAt: 0,
      source: 'placeholder',
      ...rawProps,
    };

    const now = env.date instanceof Date ? env.date.getTime() : Date.now();
    const fetchedAt = Number.isFinite(props.fetchedAt) ? props.fetchedAt : 0;
    const ageMs = fetchedAt > 0 ? Math.max(0, now - fetchedAt) : Number.POSITIVE_INFINITY;
    const freshness =
      fetchedAt <= 0 ? 'No data' : ageMs > STALE_AFTER_MS ? 'Stale' : '';
    const showFreshness = freshness.length > 0;
    const freshnessColor = WARNING;
    const isLockScreen = env.widgetFamily === 'accessoryRectangular';
    const isMedium = env.widgetFamily === 'systemMedium';
    const targetUrl = props.hasAddress ? 'paraapp://home' : 'paraapp://settings';

    function Label({ text }: { text: string }) {
      return (
        <Text
          modifiers={[
            font({ textStyle: 'caption2', weight: 'semibold', design: 'monospaced' }),
            foregroundStyle(MUTED),
            lineLimit(1),
          ]}
        >
          {text}
        </Text>
      );
    }

    function Value({ text, size = 22 }: { text: string; size?: number }) {
      return (
        <Text
          modifiers={[
            font({ size, weight: 'bold', design: 'monospaced' }),
            monospacedDigit(),
            foregroundStyle(TEXT),
            lineLimit(1),
            minimumScaleFactor(0.6),
            allowsTightening(true),
          ]}
        >
          {text}
        </Text>
      );
    }

    function StatusText({
      label,
      value,
      color,
    }: {
      label: string;
      value: string | number;
      color: string;
    }) {
      return (
        <HStack spacing={3}>
          <Text
            modifiers={[
              font({ textStyle: 'caption2', weight: 'bold', design: 'monospaced' }),
              foregroundStyle(color),
              lineLimit(1),
            ]}
          >
            {value}
          </Text>
          <Text
            modifiers={[
              font({ textStyle: 'caption2', weight: 'medium' }),
              foregroundStyle(MUTED),
              lineLimit(1),
            ]}
          >
            {label}
          </Text>
        </HStack>
      );
    }

    function FreshnessBadge() {
      if (!showFreshness) {
        return null;
      }

      return (
        <Text
          modifiers={[
            font({ textStyle: 'caption2', weight: 'semibold' }),
            foregroundStyle(freshnessColor),
            lineLimit(1),
          ]}
        >
          {freshness}
        </Text>
      );
    }

    function WorkerStatusStack() {
      return (
        <VStack alignment="leading" spacing={1}>
          <Label text="WORKERS" />
          <StatusText label="online" value={props.onlineWorkers} color={SUCCESS} />
          <StatusText label="stale" value={props.staleWorkers} color={WARNING} />
          <StatusText label="offline" value={props.offlineWorkers} color={DANGER} />
        </VStack>
      );
    }

    if (isLockScreen) {
      return (
        <VStack
          alignment="leading"
          spacing={3}
          modifiers={[
            containerBackground(BG, 'widget'),
            padding({ all: 2 }),
            frame({
              minWidth: 0,
              maxWidth: 1000,
              minHeight: 0,
              maxHeight: 1000,
              alignment: 'topLeading',
            }),
            widgetURL(targetUrl),
          ]}
        >
          <HStack spacing={5} modifiers={[frame({ maxWidth: 1000 })]}>
            <Text
              modifiers={[
                font({ textStyle: 'caption', weight: 'bold', design: 'monospaced' }),
                foregroundStyle(TEXT),
                lineLimit(1),
                minimumScaleFactor(0.6),
              ]}
            >
              {props.hasAddress ? props.hashrate : 'Add address'}
            </Text>
            <Spacer />
            {props.hasAddress ? (
              <Text
                modifiers={[
                  font({ textStyle: 'caption2', weight: 'semibold', design: 'monospaced' }),
                  foregroundStyle(TEXT),
                  lineLimit(1),
                ]}
              >
                {props.bestDiff}
              </Text>
            ) : (
              <FreshnessBadge />
            )}
          </HStack>
          {props.hasAddress ? (
            <HStack spacing={7} modifiers={[frame({ maxWidth: 1000 })]}>
              <StatusText label="on" value={props.onlineWorkers} color={SUCCESS} />
              <StatusText label="stale" value={props.staleWorkers} color={WARNING} />
              <StatusText label="off" value={props.offlineWorkers} color={DANGER} />
            </HStack>
          ) : (
            <Text
              modifiers={[
                font({ textStyle: 'caption2', weight: 'medium' }),
                foregroundStyle(MUTED),
                lineLimit(1),
              ]}
            >
              Open settings
            </Text>
          )}
        </VStack>
      );
    }

    if (!props.hasAddress) {
      return (
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            containerBackground(BG, 'widget'),
            padding({ all: 12 }),
            frame({
              minWidth: 0,
              maxWidth: 1000,
              minHeight: 0,
              maxHeight: 1000,
              alignment: 'topLeading',
            }),
            widgetURL('paraapp://settings'),
          ]}
        >
          <Label text="PARAAPP" />
          <Spacer />
          <Value text="Add address" size={18} />
          <Text
            modifiers={[
              font({ textStyle: 'caption' }),
              foregroundStyle(MUTED),
              lineLimit(2),
            ]}
          >
            Open settings to show your mining stats.
          </Text>
        </VStack>
      );
    }

    if (isMedium) {
      return (
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            containerBackground(BG, 'widget'),
            padding({ all: 12 }),
            frame({
              minWidth: 0,
              maxWidth: 1000,
              minHeight: 0,
              maxHeight: 1000,
              alignment: 'topLeading',
            }),
            widgetURL('paraapp://home'),
          ]}
        >
          <HStack spacing={6}>
            <Label text={props.addressLabel} />
            <Spacer />
            <FreshnessBadge />
          </HStack>
          <HStack spacing={14}>
            <VStack alignment="leading" spacing={2}>
              <Label text="NOW" />
              <Value text={props.hashrate} size={24} />
            </VStack>
            <VStack alignment="leading" spacing={2}>
              <Label text="BEST DIFF" />
              <Value text={props.bestDiff} size={18} />
            </VStack>
          </HStack>
          <HStack spacing={12}>
            <VStack alignment="leading" spacing={2}>
              <Label text="1H AVG" />
              <Text
                modifiers={[
                  font({ size: 15, weight: 'semibold', design: 'monospaced' }),
                  foregroundStyle(TEXT),
                  lineLimit(1),
                  minimumScaleFactor(0.6),
                ]}
              >
                {props.hashrate1h}
              </Text>
            </VStack>
            <VStack alignment="leading" spacing={2}>
              <Label text="24H AVG" />
              <Text
                modifiers={[
                  font({ size: 15, weight: 'semibold', design: 'monospaced' }),
                  foregroundStyle(TEXT),
                  lineLimit(1),
                  minimumScaleFactor(0.6),
                ]}
              >
                {props.hashrate24h}
              </Text>
            </VStack>
            <WorkerStatusStack />
          </HStack>
        </VStack>
      );
    }

    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          containerBackground(BG, 'widget'),
          padding({ all: 8 }),
          frame({
            minWidth: 0,
            maxWidth: 1000,
            minHeight: 0,
            maxHeight: 1000,
            alignment: 'topLeading',
          }),
          widgetURL('paraapp://home'),
        ]}
      >
        <HStack spacing={6}>
          <Label text={props.addressLabel} />
          <Spacer />
          <FreshnessBadge />
        </HStack>
        <Value text={props.hashrate} size={20} />
        <VStack alignment="leading" spacing={1}>
          <Label text="BEST DIFF" />
          <Value text={props.bestDiff} size={17} />
        </VStack>
        <HStack spacing={8}>
          <StatusText label="on" value={props.onlineWorkers} color={SUCCESS} />
          {props.staleWorkers > 0 ? (
            <StatusText label="stale" value={props.staleWorkers} color={WARNING} />
          ) : null}
          {props.offlineWorkers > 0 ? (
            <StatusText label="off" value={props.offlineWorkers} color={DANGER} />
          ) : null}
        </HStack>
      </VStack>
    );
  }
);

export const poolOverviewWidget = createWidget<PartialPoolSnapshot>(
  POOL_WIDGET_NAME,
  (rawProps, env: WidgetEnvironment) => {
    'widget';

    const BG = '#0a0a0a';
    const TEXT = '#ededed';
    const MUTED = '#8a8a8a';
    const WARNING = '#facc15';
    const STALE_AFTER_MS = 60 * 60 * 1000;

    const props = {
      kind: 'pool',
      poolHashrate: '-- H/s',
      users: '--',
      workers: '--',
      highestDiff: '--',
      lastBlock: '--',
      fetchedAt: 0,
      source: 'placeholder',
      ...rawProps,
    };

    const now = env.date instanceof Date ? env.date.getTime() : Date.now();
    const fetchedAt = Number.isFinite(props.fetchedAt) ? props.fetchedAt : 0;
    const ageMs = fetchedAt > 0 ? Math.max(0, now - fetchedAt) : Number.POSITIVE_INFINITY;
    const freshness =
      fetchedAt <= 0 ? 'No data' : ageMs > STALE_AFTER_MS ? 'Stale' : '';
    const showFreshness = freshness.length > 0;
    const freshnessColor = WARNING;
    const isLockScreen = env.widgetFamily === 'accessoryRectangular';
    const isMedium = env.widgetFamily === 'systemMedium';
    const blockValue =
      props.lastBlock !== '--' && props.lastBlock.length <= 9 ? props.lastBlock : '--';

    function Label({ text }: { text: string }) {
      return (
        <Text
          modifiers={[
            font({ textStyle: 'caption2', weight: 'semibold', design: 'monospaced' }),
            foregroundStyle(MUTED),
            lineLimit(1),
          ]}
        >
          {text}
        </Text>
      );
    }

    function Value({ text, size = 22 }: { text: string; size?: number }) {
      return (
        <Text
          modifiers={[
            font({ size, weight: 'bold', design: 'monospaced' }),
            monospacedDigit(),
            foregroundStyle(TEXT),
            lineLimit(1),
            minimumScaleFactor(0.6),
            allowsTightening(true),
          ]}
        >
          {text}
        </Text>
      );
    }

    function Freshness() {
      if (!showFreshness) {
        return null;
      }

      return (
        <Text
          modifiers={[
            font({ textStyle: 'caption2', weight: 'medium' }),
            foregroundStyle(freshnessColor),
            lineLimit(1),
          ]}
        >
          {freshness}
        </Text>
      );
    }

    function FreshnessBadge() {
      if (!showFreshness) {
        return null;
      }

      return (
        <Text
          modifiers={[
            font({ textStyle: 'caption2', weight: 'semibold' }),
            foregroundStyle(freshnessColor),
            lineLimit(1),
          ]}
        >
          {freshness}
        </Text>
      );
    }

    function Metric({
      label,
      value,
      color = TEXT,
    }: {
      label: string;
      value: string | number;
      color?: string;
    }) {
      return (
        <VStack
          alignment="leading"
          spacing={1}
          modifiers={[frame({ minWidth: 0, maxWidth: 1000, alignment: 'leading' })]}
        >
          <Text
            modifiers={[
              font({ textStyle: 'caption2', weight: 'semibold', design: 'monospaced' }),
              foregroundStyle(MUTED),
              lineLimit(1),
            ]}
          >
            {label}
          </Text>
          <Text
            modifiers={[
              font({ size: 14, weight: 'bold', design: 'monospaced' }),
              foregroundStyle(color),
              monospacedDigit(),
              lineLimit(1),
            ]}
          >
            {value}
          </Text>
        </VStack>
      );
    }

    if (isLockScreen) {
      return (
        <VStack
          alignment="leading"
          spacing={3}
          modifiers={[
            containerBackground(BG, 'widget'),
            padding({ all: 2 }),
            frame({
              minWidth: 0,
              maxWidth: 1000,
              minHeight: 0,
              maxHeight: 1000,
              alignment: 'topLeading',
            }),
            widgetURL('paraapp://pool'),
          ]}
        >
          <HStack spacing={5} modifiers={[frame({ maxWidth: 1000 })]}>
            <Text
              modifiers={[
                font({ textStyle: 'caption', weight: 'bold', design: 'monospaced' }),
                foregroundStyle(TEXT),
                lineLimit(1),
                minimumScaleFactor(0.6),
              ]}
            >
              {props.poolHashrate}
            </Text>
            <Spacer />
            <Text
              modifiers={[
                font({ textStyle: 'caption2', weight: 'semibold' }),
                foregroundStyle(TEXT),
                lineLimit(1),
              ]}
            >
              {props.highestDiff}
            </Text>
          </HStack>
          <Freshness />
        </VStack>
      );
    }

    if (isMedium) {
      return (
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            containerBackground(BG, 'widget'),
            padding({ all: 12 }),
            frame({
              minWidth: 0,
              maxWidth: 1000,
              minHeight: 0,
              maxHeight: 1000,
              alignment: 'topLeading',
            }),
            widgetURL('paraapp://pool'),
          ]}
        >
          <HStack spacing={6}>
            <Label text="PARASITE POOL" />
            <Spacer />
            <FreshnessBadge />
          </HStack>
          <HStack spacing={16}>
            <VStack alignment="leading" spacing={2}>
              <Label text="HASHRATE" />
              <Value text={props.poolHashrate} size={24} />
            </VStack>
            <VStack alignment="leading" spacing={2}>
              <Label text="BEST DIFF" />
              <Value text={props.highestDiff} size={18} />
            </VStack>
          </HStack>
          <HStack spacing={12} modifiers={[frame({ maxWidth: 1000 })]}>
            <Metric label="USERS" value={props.users} />
            <Metric label="WORKERS" value={props.workers} />
            <Metric label="BLOCK" value={blockValue} />
          </HStack>
        </VStack>
      );
    }

    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          containerBackground(BG, 'widget'),
          padding({ all: 8 }),
          frame({
            minWidth: 0,
            maxWidth: 1000,
            minHeight: 0,
            maxHeight: 1000,
            alignment: 'topLeading',
          }),
          widgetURL('paraapp://pool'),
        ]}
      >
        <HStack spacing={6}>
          <Label text="PARASITE POOL" />
          <Spacer />
          <FreshnessBadge />
        </HStack>
        <Value text={props.poolHashrate} size={20} />
        <VStack alignment="leading" spacing={1}>
          <Label text="BEST DIFF" />
          <Value text={props.highestDiff} size={18} />
        </VStack>
      </VStack>
    );
  }
);

void personalMiningWidget.getTimeline().then((entries) => {
  if (entries.length === 0) {
    personalMiningWidget.updateSnapshot(INITIAL_PERSONAL_SNAPSHOT);
  }
});

void poolOverviewWidget.getTimeline().then((entries) => {
  if (entries.length === 0) {
    poolOverviewWidget.updateSnapshot(INITIAL_POOL_SNAPSHOT);
  }
});
