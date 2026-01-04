/**
 * Toast notification component with app theme styling
 */

import type { ViewStyle, TextStyle } from 'react-native';
import ToastLib, { BaseToast, type ToastConfig } from 'react-native-toast-message';
import { colors } from '@/constants/colors';

// Shared styles to reduce duplication
const baseStyle: ViewStyle = {
  backgroundColor: colors.surface,
  borderLeftWidth: 4,
  zIndex: 9999,
  elevation: 9999,
};

const contentContainerStyle: ViewStyle = {
  paddingHorizontal: 15,
};

const text1Style: TextStyle = {
  fontSize: 14,
  fontWeight: '600',
  color: colors.text,
};

const text2Style: TextStyle = {
  fontSize: 12,
  color: colors.textMuted,
};

const toastConfig: ToastConfig = {
  info: (props) => (
    <BaseToast
      {...props}
      style={{ ...baseStyle, borderLeftColor: colors.primary }}
      contentContainerStyle={contentContainerStyle}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
  success: (props) => (
    <BaseToast
      {...props}
      style={{ ...baseStyle, borderLeftColor: colors.success }}
      contentContainerStyle={contentContainerStyle}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
  error: (props) => (
    <BaseToast
      {...props}
      style={{ ...baseStyle, borderLeftColor: colors.danger }}
      contentContainerStyle={contentContainerStyle}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
};

export function Toast() {
  return <ToastLib config={toastConfig} position="top" topOffset={60} />;
}

export { ToastLib as ToastManager };
