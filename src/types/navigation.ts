/**
 * Navigation types for React Navigation v7
 * Provides type-safe navigation throughout the app
 */

import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
 * Home tab stack navigator param list
 */
export type HomeStackParamList = {
  HomeMain: undefined;
  WorkersList: undefined;
};

/**
 * Miners tab stack navigator param list
 */
export type MinersStackParamList = {
  MinersMain: undefined;
  MinerDetail: { ip: string };
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
 * Helper type for Home stack screen props
 * Composite type for screens that are nested in Home tab
 * Usage: HomeStackScreenProps<'HomeMain'>
 */
export type HomeStackScreenProps<T extends keyof HomeStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, T>,
  BottomTabScreenProps<MainTabParamList>
>;

/**
 * Helper type for Miners stack screen props
 * Composite type for screens that are nested in Miners tab
 * Usage: MinersStackScreenProps<'MinersMain'>
 */
export type MinersStackScreenProps<T extends keyof MinersStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<MinersStackParamList, T>,
  BottomTabScreenProps<MainTabParamList>
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
