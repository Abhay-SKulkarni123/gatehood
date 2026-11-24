const useFirebaseEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

module.exports = {
  expo: {
    name: 'Gatehood',
    slug: 'gatehood',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'gatehood',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.gatehood.app',
      googleServicesFile: './GoogleService-Info.plist',
      icon: './assets/expo.icon',
    },
    android: {
      package: 'com.gatehood.app',
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#0B1F3A',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-router',
      'expo-dev-client',
      '@react-native-firebase/app',
      '@react-native-firebase/app-check',
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: useFirebaseEmulator,
          },
          ios: {
            useFrameworks: 'dynamic',
          },
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0B1F3A',
          image: './assets/images/splash-icon.png',
          imageWidth: 96,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
