import './global.css';
import '@/i18n'; // Initialize i18n

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PoolScreen } from '@/screens';
import { TabBar } from '@/components/navigation/TabBar';
import { Toast } from '@/components/Toast';
import { HomeStack, MinersStack, SettingsStack } from '@/navigation';
import { colors } from '@/constants/colors';
import { changeLanguage } from '@/i18n';
import { useSettingsStore, selectIsHydrated, selectLanguage } from '@/store/settingsStore';
import { useNotifications } from '@/hooks/useNotifications';
import { useWidgetUpdates } from '@/hooks/useWidgetUpdates';
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

  // Initialize push notifications
  useNotifications();
  useWidgetUpdates();

  // Sync language preference on app startup
  useEffect(() => {
    if (isHydrated) {
      changeLanguage(language);
    }
  }, [isHydrated, language]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            <Tab.Screen name="Miners" component={MinersStack} />
            <Tab.Screen name="Settings" component={SettingsStack} />
          </Tab.Navigator>
          <Toast />
        </NavigationContainer>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
