/**
 * SettingsCard - The framed section card used across the Settings screen: a square
 * hairline surface (#0a0a0b fill) with a monospace uppercase header underlined by
 * an 8%-white hairline, and an optional right-aligned header slot (e.g. the VALID
 * chip). Direct children are treated as rows and separated by 7%-white hairlines.
 */

import { Children, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';

const HEADER_DIVIDER = 'rgba(255,255,255,0.08)';
const ROW_DIVIDER = 'rgba(255,255,255,0.07)';

export interface SettingsCardProps {
  /** Uppercased in the header (e.g. "Preferences" → PREFERENCES). */
  header: string;
  /** Optional right-aligned header content, e.g. the VALID chip. */
  headerRight?: ReactNode;
  children: ReactNode;
}

export function SettingsCard({ header, headerRight, children }: SettingsCardProps) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: HEADER_DIVIDER,
        }}
      >
        <Text
          variant="mono"
          className="uppercase"
          style={{ fontSize: 11, letterSpacing: 2, color: colors.textDim }}
        >
          {header}
        </Text>
        {headerRight}
      </View>

      {/* Rows */}
      {rows.map((row, i) => (
        <View
          key={i}
          style={
            i === 0
              ? undefined
              : { borderTopWidth: 1, borderTopColor: ROW_DIVIDER }
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}
