/**
 * BadgeMedals - Shared SVG medals for achievement badges.
 * Rendered at small size (44) in the AchievementsCard row and large size
 * (~140) in the BadgeDetailSheet. The viewBox is fixed at 48 so changing
 * width/height scales the whole medal (including text) proportionally.
 */

import Svg, { Circle, Rect, Path, G, Text as SvgText } from 'react-native-svg';

export interface MedalProps {
  size?: number;
}

/** Crossed-pickaxe medal stamped with a block height (a round the user mined). */
export function BlockMedal({
  size = 44,
  blockHeight,
}: MedalProps & { blockHeight: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Outer metallic ring */}
      <Circle cx={24} cy={24} r={22} fill="#b0b0b0" />

      {/* Medal face */}
      <Circle cx={24} cy={24} r={18.5} fill="#1a1a1a" />

      {/* Inner ring detail */}
      <Circle
        cx={24}
        cy={24}
        r={16}
        fill="none"
        stroke="#555"
        strokeWidth={0.5}
        strokeOpacity={0.6}
      />

      {/* Crossed pickaxes */}
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

      {/* Block height text */}
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

/** Factory medal for the Refinery Operator badge (ported from parasite.space). */
export function RefineryMedal({ size = 44 }: MedalProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Outer metallic ring */}
      <Circle cx={24} cy={24} r={22} fill="#b0b0b0" />

      {/* Medal face */}
      <Circle cx={24} cy={24} r={18.5} fill="#1a1a1a" />

      {/* Factory icon */}
      <G transform="translate(24 20) scale(1.35) translate(-10 -10)">
        <Path d="M3 17V11h2V3h3v8h4V5h3v6h2v6H3z" fill="#d8d8d8" />
        <Path
          d="M6.2 6.2h1.1v4.8H6.2zM13.2 8.1h1.1V11h-1.1zM4.6 14h10.8v1.2H4.6z"
          fill="#1a1a1a"
        />
        {/* Window lights + chimney caps in bitcoin orange */}
        <Path
          d="M5.7 12.2h1.2v1H5.7zM8.2 12.2h1.2v1H8.2zM10.7 12.2h1.2v1h-1.2zM13.2 12.2h1.2v1h-1.2z"
          fill="#f7931a"
        />
        <Rect x={4.55} y={2.55} width={4.1} height={0.85} rx={0.42} fill="#f7931a" />
        <Rect x={11.55} y={4.55} width={4.1} height={0.85} rx={0.42} fill="#f7931a" />
      </G>

      {/* Caption */}
      <SvgText
        x={24}
        y={35.2}
        textAnchor="middle"
        fill="#e0d0aa"
        fontSize={3.7}
        fontFamily="monospace"
        fontWeight="bold"
      >
        REFINERY
      </SvgText>
      <SvgText
        x={24}
        y={39}
        textAnchor="middle"
        fill="#e0d0aa"
        fontSize={3.7}
        fontFamily="monospace"
        fontWeight="bold"
      >
        OPERATOR
      </SvgText>
    </Svg>
  );
}
