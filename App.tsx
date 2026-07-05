import './global.css';
import '@/i18n'; // Initialize i18n

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { PoolScreen, ChatScreen } from '@/screens';
import { TabBar } from '@/components/navigation/TabBar';
import { Toast } from '@/components/Toast';
import { HomeStack, MinersStack, SettingsStack } from '@/navigation';
import { colors } from '@/constants/colors';
import { changeLanguage } from '@/i18n';
import { useSettingsStore, selectIsHydrated, selectLanguage } from '@/store/settingsStore';
import { useNotifications } from '@/hooks/useNotifications';
import { useWidgetUpdates } from '@/hooks/useWidgetUpdates';
import { useChatUnreadCheck } from '@/hooks/useChatUnreadCheck';
import type { MainTabParamList } from '@/types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.text,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

const linking: LinkingOptions<MainTabParamList> = {
  prefixes: ['paraapp://'],
  config: {
    screens: {
      Home: {
        path: 'home',
        screens: {
          HomeMain: '',
          WorkersList: 'workers',
        },
      },
      Pool: 'pool',
      Chat: 'chat',
      Miners: 'miners',
      Settings: {
        path: 'settings',
        screens: {
          SettingsMain: '',
          QRScanner: 'qr',
        },
      },
    },
  },
};

export default function App() {
  const isHydrated = useSettingsStore(selectIsHydrated);
  const language = useSettingsStore(selectLanguage);

  // Load brand fonts: JetBrains Mono (data) + Space Grotesk (titles/prose)
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // If a bundled font ever fails to load, fall back to system fonts rather than
  // holding a permanent black screen (see the fontsLoaded gate below).
  useEffect(() => {
    if (fontError) {
      console.warn('[fonts] failed to load brand fonts; using system fonts', fontError);
    }
  }, [fontError]);

  // Initialize push notifications
  useNotifications();
  useWidgetUpdates();
  // Chat unread probe — lights the tab-bar dot without ChatScreen ever mounting
  useChatUnreadCheck();

  // Sync language preference on app startup
  useEffect(() => {
    if (isHydrated) {
      changeLanguage(language);
    }
  }, [isHydrated, language]);

  // Hold the (black) screen until fonts are ready to avoid a system-font flash.
  // On a font-load error, proceed anyway (system fonts) instead of hanging.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <NavigationContainer theme={navigationTheme} linking={linking}>
            <Tab.Navigator
              tabBar={(props) => <TabBar {...props} />}
              screenOptions={{
                headerShown: false,
                // Expo SDK 54 / React Navigation 7 can intermittently blank tab scenes
                // during animated tab transitions. Keep the default non-animated switch.
                animation: 'none',
              }}
            >
              <Tab.Screen name="Home" component={HomeStack} />
              <Tab.Screen name="Pool" component={PoolScreen} />
              <Tab.Screen name="Chat" component={ChatScreen} />
              <Tab.Screen name="Miners" component={MinersStack} />
              <Tab.Screen name="Settings" component={SettingsStack} />
            </Tab.Navigator>
            <Toast />
          </NavigationContainer>
          <StatusBar style="light" />
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
