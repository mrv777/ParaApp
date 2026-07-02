/**
 * App-themed toast. Terminal/brutalist aesthetic: a sharp-cornered dark surface
 * with a full hairline border (no rounded card, no Material left-accent bar).
 * Status is signalled by a small square dot — matching the app's block-glyph
 * motif — rather than a colored edge.
 */

import { View, Text, StyleSheet } from 'react-native';
import ToastLib, { type ToastConfig } from 'react-native-toast-message';
import { colors } from '@/constants/colors';

function ThemedToast({
  text1,
  text2,
  tint,
}: {
  text1?: string;
  text2?: string;
  tint: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.tick, { backgroundColor: tint }]} />
      <View style={styles.textCol}>
        {text1 ? (
          <Text style={styles.text1} numberOfLines={2}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text style={styles.text2} numberOfLines={2}>
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const toastConfig: ToastConfig = {
  info: (props) => (
    <ThemedToast text1={props.text1} text2={props.text2} tint={colors.primary} />
  ),
  success: (props) => (
    <ThemedToast text1={props.text1} text2={props.text2} tint={colors.success} />
  ),
  error: (props) => (
    <ThemedToast text1={props.text1} text2={props.text2} tint={colors.danger} />
  ),
};

export function Toast() {
  return <ToastLib config={toastConfig} position="top" topOffset={60} />;
}

export { ToastLib as ToastManager };

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    width: '92%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  tick: { width: 7, height: 7 }, // small status square (sharp, on-theme)
  textCol: { flex: 1, gap: 2 },
  text1: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: colors.text,
  },
  text2: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
});
