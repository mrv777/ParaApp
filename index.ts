import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';
import './src/widgets/backgroundTask';

// Android home-screen widgets render via a headless JS task. Registered here so
// it's available even when the OS launches the task without the full app UI.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/android/taskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
