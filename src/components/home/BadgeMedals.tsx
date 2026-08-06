/**
 * BadgeMedals - Shared SVG medals for achievement badges, ported from
 * parastats (app/components/badges). Rendered small (44/56) in badge rows and
 * large (~140) in the BadgeDetailSheet. The viewBox is fixed at 48 so changing
 * width/height scales the whole medal (including text) proportionally.
 */

import type { ReactNode } from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, Ellipse, Rect, Path, G, Text as SvgText } from 'react-native-svg';
import { colors } from '@/constants/colors';
import type { BadgeMedalDescriptor, StackedBadgeKind } from '@/types';
import { HIDDEN_COUNT_KINDS } from '@/types';

export interface MedalProps {
  size?: number;
}

// ============================================
// Medal-face icons (drawn inside the 48x48 face)
// ============================================

function PickaxeIcon() {
  return (
    <G opacity={0.8} transform="translate(24, 22)">
      <G transform="rotate(-35)">
        <Rect x={-0.8} y={-9} width={1.6} height={15} rx={0.8} fill="#ccc" />
        <Path d="M-7-10c2-2 5-2 7-2s5 0 7 2l-7 2z" fill="#ccc" />
      </G>
      <G transform="rotate(35)">
        <Rect x={-0.8} y={-9} width={1.6} height={15} rx={0.8} fill="#ccc" />
        <Path d="M-7-10c2-2 5-2 7-2s5 0 7 2l-7 2z" fill="#ccc" />
      </G>
    </G>
  );
}

function TrophyIcon() {
  return (
    <G transform="translate(24 23) scale(0.9)" fill="#f7d774">
      <Path d="M-6-9h12v3a6 6 0 0 1-12 0z" />
      <Path
        d="M-6-8h-2.5a2.5 2.5 0 0 0 2.5 4zM6-8h2.5a2.5 2.5 0 0 1-2.5 4z"
        fill="none"
        stroke="#f7d774"
        strokeWidth={1.1}
      />
      <Rect x={-1.2} y={-3} width={2.4} height={5} />
      <Rect x={-4} y={2} width={8} height={1.8} rx={0.6} />
      <Rect x={-2.8} y={3.6} width={5.6} height={1.8} rx={0.6} />
    </G>
  );
}

function LoyaltyIcon() {
  return (
    <G transform="translate(24 22)">
      {/* ribbon */}
      <Path d="M-3 2l-2.5 7 3.5-1.8L-1 12l1.5-6z" fill="#c0392b" />
      <Path d="M3 2l2.5 7-3.5-1.8L1 12l-1.5-6z" fill="#c0392b" />
      {/* medal disc */}
      <Circle cx={0} cy={-1} r={6.5} fill="#f7d774" stroke="#d8b24a" strokeWidth={0.8} />
      <Path d="M0-5.2l1.4 2.9 3.2.4-2.3 2.2.6 3.1L0 3.9l-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z" fill="#c9962f" />
    </G>
  );
}

function DispenserIcon() {
  return (
    <G transform="translate(24 22)">
      {/* globe */}
      <Circle cx={0} cy={-3.5} r={6} fill="#7fd1e8" opacity={0.85} />
      <Circle cx={-2} cy={-5} r={1.4} fill="#e74c3c" />
      <Circle cx={2.2} cy={-4} r={1.4} fill="#f1c40f" />
      <Circle cx={0} cy={-1.5} r={1.4} fill="#2ecc71" />
      <Circle cx={-2.4} cy={-1.6} r={1.2} fill="#9b59b6" />
      <Circle cx={2.6} cy={-1.4} r={1.2} fill="#e67e22" />
      {/* base + chute */}
      <Path d="M-6 2h12l-1.5 6h-9z" fill="#d8d8d8" />
      <Rect x={-2} y={4.6} width={4} height={2.2} rx={0.5} fill="#1a1a1a" />
    </G>
  );
}

/** Bravocado: a spotted mushroom cap on a pale stem. */
function MushroomIcon() {
  return (
    <G transform="translate(24 21)">
      {/* stem */}
      <Path d="M-2.6 0h5.2v6.6a2.6 2.6 0 0 1-5.2 0z" fill="#f2e3c8" />
      <Path d="M-2.6 0h2v9a2.6 2.6 0 0 1-2-2.4z" fill="#dbc9a6" />
      {/* cap */}
      <Path d="M-9.5 0a9.5 8 0 0 1 19 0z" fill="#d0392f" />
      <Ellipse cx={-4.6} cy={-2.5} rx={1.8} ry={1.4} fill="#f7ede0" />
      <Ellipse cx={0.8} cy={-4.4} rx={1.5} ry={1.2} fill="#f7ede0" />
      <Ellipse cx={5.4} cy={-1.7} rx={1.3} ry={1} fill="#f7ede0" />
    </G>
  );
}

/** Miner: an ASIC chassis with a fan and heat vents. */
function MinerRigIcon() {
  return (
    <G transform="translate(24 24)">
      {/* chassis */}
      <Rect x={-10.5} y={-7} width={21} height={14} rx={1.8} fill="#d8d8d8" />
      <Rect x={-10.5} y={-7} width={21} height={14} rx={1.8} fill="none" stroke="#8a8a8a" strokeWidth={0.6} />
      {/* fan */}
      <Circle cx={-4.2} cy={0} r={4.8} fill="#1a1a1a" />
      <Circle cx={-4.2} cy={0} r={3.8} fill="none" stroke="#8a8a8a" strokeWidth={0.6} />
      <G fill="#f7931a">
        <Ellipse cx={-4.2} cy={-2.1} rx={1} ry={2} />
        <Ellipse cx={-2.4} cy={1.1} rx={1} ry={2} transform="rotate(-60 -2.4 1.1)" />
        <Ellipse cx={-6} cy={1.1} rx={1} ry={2} transform="rotate(60 -6 1.1)" />
        <Circle cx={-4.2} cy={0} r={1} />
      </G>
      {/* heat vents */}
      <Rect x={2.4} y={-4.6} width={6.6} height={1.4} rx={0.7} fill="#1a1a1a" />
      <Rect x={2.4} y={-2} width={6.6} height={1.4} rx={0.7} fill="#1a1a1a" />
      <Rect x={2.4} y={0.6} width={6.6} height={1.4} rx={0.7} fill="#1a1a1a" />
      {/* status light */}
      <Circle cx={8.2} cy={4.4} r={1.1} fill="#2ecc71" />
    </G>
  );
}

/** Auction winner: a gavel resting on its striking block. */
function GavelIcon() {
  return (
    <G transform="translate(24 21)">
      <G transform="rotate(-40)">
        {/* handle */}
        <Rect x={-1.1} y={-3} width={2.2} height={12} rx={1.1} fill="#c9962f" />
        {/* head */}
        <Rect x={-5} y={-9.5} width={10} height={6} rx={1.2} fill="#f7d774" />
        <Rect x={-5} y={-9.5} width={2} height={6} rx={0.8} fill="#c9962f" />
        <Rect x={3} y={-9.5} width={2} height={6} rx={0.8} fill="#c9962f" />
      </G>
      {/* striking block */}
      <Rect x={-8.5} y={8} width={17} height={2.8} rx={1.4} fill="#b0b0b0" />
    </G>
  );
}

function RefineryIcon() {
  return (
    <G transform="translate(24 20) scale(1.15) translate(-10 -10)">
      <Path d="M3 17V11h2V3h3v8h4V5h3v6h2v6H3z" fill="#d8d8d8" />
      <Path d="M6.2 6.2h1.1v4.8H6.2zM13.2 8.1h1.1V11h-1.1zM4.6 14h10.8v1.2H4.6z" fill="#1a1a1a" />
      {/* Window lights + chimney caps in bitcoin orange */}
      <Path d="M5.7 12.2h1.2v1H5.7zM8.2 12.2h1.2v1H8.2zM10.7 12.2h1.2v1h-1.2zM13.2 12.2h1.2v1h-1.2z" fill="#f7931a" />
      <Rect x={4.55} y={2.55} width={4.1} height={0.85} rx={0.42} fill="#f7931a" />
      <Rect x={11.55} y={4.55} width={4.1} height={0.85} rx={0.42} fill="#f7931a" />
    </G>
  );
}

const STACKED_ICONS: Record<StackedBadgeKind, () => ReactNode> = {
  block_stack: PickaxeIcon,
  loyalty: LoyaltyIcon,
  auction_winner: GavelIcon,
  bravocado: MushroomIcon,
  miner: MinerRigIcon,
  dispenser: DispenserIcon,
  refinery: RefineryIcon,
};

// ============================================
// Medals
// ============================================

/** Standard metallic medal frame (outer ring + face + inner ring detail). */
function MedalFrame({ ring = '#b0b0b0', innerRing = '#555' }: { ring?: string; innerRing?: string }) {
  return (
    <>
      <Circle cx={24} cy={24} r={22} fill={ring} />
      <Circle cx={24} cy={24} r={18.5} fill="#1a1a1a" />
      <Circle
        cx={24}
        cy={24}
        r={16}
        fill="none"
        stroke={innerRing}
        strokeWidth={0.5}
        strokeOpacity={0.6}
      />
    </>
  );
}

/** Crossed-pickaxe medal stamped with a block height (a block the user mined). */
export function BlockMedal({
  size = 44,
  blockHeight,
}: MedalProps & { blockHeight: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <MedalFrame />
      {/* Crossed pickaxes (raised to leave room for the height stamp) */}
      <G opacity={0.8} transform="translate(24, 19)">
        <G transform="rotate(-35)">
          <Rect x={-0.8} y={-9} width={1.6} height={15} rx={0.8} fill="#ccc" />
          <Path d="M-7-10c2-2 5-2 7-2s5 0 7 2l-7 2z" fill="#ccc" />
        </G>
        <G transform="rotate(35)">
          <Rect x={-0.8} y={-9} width={1.6} height={15} rx={0.8} fill="#ccc" />
          <Path d="M-7-10c2-2 5-2 7-2s5 0 7 2l-7 2z" fill="#ccc" />
        </G>
      </G>
      <SvgText
        x={24}
        y={34}
        textAnchor="middle"
        fill="#ddd"
        fontSize={7.5}
        fontFamily="monospace"
        fontWeight="bold"
      >
        {blockHeight}
      </SvgText>
    </Svg>
  );
}

/** Gold trophy medal for a block this miner's share actually solved. */
export function BlockWinnerMedal({
  size = 44,
  blockHeight,
}: MedalProps & { blockHeight: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <MedalFrame ring="#e0b84a" innerRing="#f7d774" />
      <TrophyIcon />
      <SvgText
        x={24}
        y={34}
        textAnchor="middle"
        fill="#f7d774"
        fontSize={7.5}
        fontFamily="monospace"
        fontWeight="bold"
      >
        {blockHeight}
      </SvgText>
    </Svg>
  );
}

export interface StackedMedalProps extends MedalProps {
  kind: StackedBadgeKind;
  /** Times earned; the medal renders only when >= 1, the chip when > 1. */
  count: number;
}

/**
 * A single stacking-badge medal with an optional count chip (hidden for
 * kinds in HIDDEN_COUNT_KINDS and for a single instance). Chip metrics scale
 * with `size` so the large detail-sheet render keeps its proportions.
 */
export function StackedMedal({ size = 44, kind, count }: StackedMedalProps) {
  if (count <= 0) return null;

  const Icon = STACKED_ICONS[kind];
  const showCount = !HIDDEN_COUNT_KINDS.has(kind) && count > 1;
  const scale = size / 44;
  const chipMinWidth = 18 * scale;
  const chipHeight = 18 * scale;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <MedalFrame />
        <Icon />
      </Svg>
      {showCount && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -2 * scale,
            right: -2 * scale,
            minWidth: chipMinWidth,
            height: chipHeight,
            borderRadius: chipHeight / 2,
            paddingHorizontal: 4 * scale,
            backgroundColor: '#b0b0b0',
            borderWidth: Math.max(1, 2 * scale),
            borderColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{
              color: '#000',
              fontWeight: '700',
              fontSize: 10 * scale,
              lineHeight: 12 * scale,
            }}
          >
            {count}
          </RNText>
        </View>
      )}
    </View>
  );
}

/** Render any badge-row descriptor as its medal. */
export function BadgeMedal({
  descriptor,
  size = 44,
}: MedalProps & { descriptor: BadgeMedalDescriptor }) {
  switch (descriptor.type) {
    case 'winner':
      return <BlockWinnerMedal size={size} blockHeight={descriptor.blockHeight} />;
    case 'block':
      return <BlockMedal size={size} blockHeight={descriptor.blockHeight} />;
    case 'stacked':
      return <StackedMedal size={size} kind={descriptor.kind} count={descriptor.count} />;
  }
}
