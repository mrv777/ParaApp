/**
 * Navigation types for React Navigation v7
 * Provides type-safe navigation throughout the app
 */

import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

/**
 * Main bottom tab navigator param list
 * All screens currently have no params (undefined)
 */
export type MainTabParamList = {
  Home: undefined;
  Pool: undefined;
  Miners: undefined;
  Settings: undefined;
};

/**
 * Helper type for screen component props
 * Usage: MainTabScreenProps<'Home'>
 */
export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<
  MainTabParamList,
  T
>;

/**
 * Global declaration for useNavigation() type inference
 * Enables typed navigation without explicit generics
 */
declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends MainTabParamList {}
  }
}
