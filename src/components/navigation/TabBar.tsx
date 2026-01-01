import { View, Pressable } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface TabIconConfig {
  active: IoniconsName;
  inactive: IoniconsName;
}

const TAB_ICONS: Record<string, TabIconConfig> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Pool: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  Miners: { active: 'hardware-chip', inactive: 'hardware-chip-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' },
};

const ICON_SIZE = 24;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row bg-background border-t border-border"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const icons = TAB_ICONS[route.name] ?? {
          active: 'help-circle',
          inactive: 'help-circle-outline',
        };

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={route.name}
            className="flex-1 items-center justify-center py-3"
          >
            <Ionicons
              name={isFocused ? icons.active : icons.inactive}
              size={ICON_SIZE}
              color={isFocused ? colors.text : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
