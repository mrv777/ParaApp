/**
 * Sheet — bottom sheet built on React Native's Modal + Reanimated + gesture-handler.
 *
 * Replaces @gorhom/bottom-sheet, whose portal-based BottomSheetModal does not
 * render on this RN 0.85 / New-Architecture / react-native-screens stack — it
 * mounts *beneath* the native screen and never appears (gorhom issues #1644 /
 * #2322; the FullWindowOverlay workaround fails on these versions). RN's Modal
 * uses native presentation, so it renders correctly. This provides the same
 * essentials: slide in/out, a dimmed backdrop (tap to close), and drag-to-dismiss.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { colors } from '@/constants/colors';

const OPEN_MS = 260;
const CLOSE_MS = 200;
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 800;
const HIDDEN = 1200;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Lift the sheet above the keyboard (for sheets containing a text input). */
  avoidKeyboard?: boolean;
  /**
   * Wrap the body in a ScrollView, for sheets whose content can exceed the
   * screen (many rows, large accessibility text, long translations). When set,
   * drag-to-dismiss is limited to the handle so it doesn't fight the scroll.
   */
  scrollable?: boolean;
}

export function Sheet({
  visible,
  onClose,
  children,
  avoidKeyboard = false,
  scrollable = false,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [panelHeight, setPanelHeight] = useState(0);
  const translateY = useSharedValue(HIDDEN);
  // Track latest visibility so a finishing close animation never unmounts a
  // sheet that was reopened within the close window.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const unmount = useCallback(() => {
    if (visibleRef.current) return; // reopened mid-close — keep it mounted
    setMounted(false);
    setPanelHeight(0);
  }, []);

  // Mount when shown; play the close animation (then unmount) when hidden.
  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else if (mounted) {
      translateY.value = withTiming(
        panelHeight || HIDDEN,
        { duration: CLOSE_MS },
        (finished) => {
          'worklet';
          if (finished) runOnJS(unmount)();
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Slide up once we know the panel height (avoids a flash from full-screen travel).
  useEffect(() => {
    if (mounted && visible && panelHeight > 0) {
      translateY.value = panelHeight;
      translateY.value = withTiming(0, { duration: OPEN_MS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, visible, panelHeight]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setPanelHeight((prev) => (prev === 0 ? h : prev));
  }, []);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 150 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) return null;

  const KbWrapper = avoidKeyboard ? KeyboardAvoidingView : View;
  const pad = Math.max(insets.bottom, 16);

  // Scrollable: drag from the handle only so the ScrollView scrolls freely.
  // Non-scrollable: drag anywhere on the panel (the whole panel is the target).
  const panel = scrollable ? (
    <Animated.View
      onLayout={onLayout}
      style={[styles.panel, panelStyle]}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.handleArea}>
          <View style={styles.handle} />
        </View>
      </GestureDetector>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: pad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  ) : (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayout}
        style={[styles.panel, { paddingBottom: pad }, panelStyle]}
      >
        <View style={styles.handle} />
        {children}
      </Animated.View>
    </GestureDetector>
  );

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Dimmed backdrop — tap to dismiss */}
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />

        <KbWrapper
          style={styles.fill}
          pointerEvents="box-none"
          {...(avoidKeyboard
            ? { behavior: Platform.OS === 'ios' ? ('padding' as const) : ('height' as const) }
            : {})}
        >
          <View style={styles.bottom} pointerEvents="box-none">
            {panel}
          </View>
        </KbWrapper>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '90%',
  },
  scroll: { flexShrink: 1 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginBottom: 12,
  },
  handleArea: { paddingTop: 4 },
});
