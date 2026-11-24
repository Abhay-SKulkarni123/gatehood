# Gatehood

Gatehood is a React Native construction communication app. Phase 1 provides the project foundation only: Expo SDK 58, Expo Router, strict TypeScript, React Native Firebase integration, App Check initialization hooks, Firebase Emulator configuration, and foundational UI components.

No business workflows are implemented yet. There are no authentication screens, invites, CSV import, notices, feeds, read tracking, or builder/buyer dashboards.

## Tech stack

- Expo SDK 58 with Development Builds
- Expo Router
- React 19.3.0 and React Native 0.88.1
- TypeScript strict mode
- React Native Firebase 27.1.1: app, auth, firestore, functions, app-check
- Jest and eslint-config-expo
- Firebase Emulator Suite

Expo Go is not supported because React Native Firebase uses native modules. Use an Android/iOS development build or EAS Build.

## Prerequisites

- Node.js 22.13 or newer
- npm
- JDK 17 for Android builds
- Android Studio with SDK tools for Android development
- macOS, Xcode, and CocoaPods for iOS development
- Firebase CLI for local emulators: `npm install -g firebase-tools`

Firebase configuration files are not included in this repository. You must supply your own:

- Android: `google-services.json`
- iOS: `GoogleService-Info.plist`

Both files are gitignored. Do not commit service accounts, private keys, or downloaded Firebase configuration.

## Installation

```bash
npm install
cp .env.example .env
```

Edit `.env` with your own values.

### Client-visible variables

```text
EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID=demo-project
EXPO_PUBLIC_FUNCTIONS_REGION=us-central1
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true
```

`EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID` is the residential construction project identifier. It is not the Firebase infrastructure project ID.

`EXPO_PUBLIC_FUNCTIONS_REGION` is the Cloud Functions deployment region.

`EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true` points Auth and Firestore at local emulators and enables Android cleartext HTTP for that development build only. Set it to `false` or leave it unset for production/release builds. App Check has no emulator; the Functions emulator and client wiring are deferred until Functions source exists.

### Backend and deployment variables

These are placeholders for later phases and are not consumed by the Phase 1 app:

```text
FIREBASE_PROJECT_ID=your-firebase-project-id
CONSTRUCTION_PROJECT_ID=demo-project
FUNCTIONS_REGION=us-central1
```

`FIREBASE_PROJECT_ID` identifies Firebase infrastructure. `CONSTRUCTION_PROJECT_ID` identifies the residential project. Do not use them interchangeably.

Missing or invalid client configuration produces a startup error in the app with a retry action.

### Android cleartext traffic

`app.config.js` sets the `expo-build-properties` value `android.usesCleartextTraffic` from `EXPO_PUBLIC_USE_FIREBASE_EMULATOR`. Only the exact string `true` enables it, so release builds without that value do not globally permit cleartext HTTP. The iOS dynamic framework configuration is unchanged.

Inspect the resolved config for each build environment:

```bash
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true npx expo config --type public
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=false npx expo config --type public
```

## Firebase configuration

A real Firebase project is not connected in this repository. Native builds require your own Firebase app configuration files placed at the repository root:

```text
./google-services.json
./GoogleService-Info.plist
```

The Android package is `com.gatehood.app` and the iOS bundle identifier is `com.gatehood.app`. Your Firebase apps must use matching identifiers.

App Check is initialized from `src/lib/firebase/index.ts` through a singleton Firebase module. It is initialized immediately after `getApp()` and before `getAuth()`, `getFirestore()`, or `getFunctions()` are called, and it is cached so repeated calls and retries do not initialize it again. In debug builds, the Android and Apple debug providers are selected. In release builds, Play Integrity and App Attest with DeviceCheck fallback are selected as the intended provider configuration. Production tokens require real Firebase console app registration and App Check provider configuration; no production enforcement is claimed or operational in Phase 1.

## Running locally

Install dependencies and validate configuration:

```bash
npm install
npx expo install --check
npm run typecheck
npm run lint
npm test
npx expo config --type public
npx expo-doctor@latest
```

Start Metro:

```bash
npm start
```

Android development build:

```bash
npx expo run:android
```

iOS development build on macOS:

```bash
npx expo run:ios
```

Alternatively, use EAS Build to create installable development builds.

Start Firebase emulators in a separate terminal:

```bash
firebase emulators:start
```

Emulator ports:

- Auth: `9099`
- Firestore: `8080`
- Emulator UI: `5000`

Only the Auth and Firestore emulators are configured in `firebase.json`. The client only calls `connectAuthEmulator` and `connectFirestoreEmulator`; there is no Functions emulator running and no `connectFunctionsEmulator` call in Phase 1. Functions emulator configuration and client wiring are deferred until Functions source and a Functions emulator entry exist. Firestore rules are explicitly default-deny in Phase 1.

## Folder structure

```text
app.config.js
firebase.json
firestore.rules
firestore.indexes.json
src/
  app/
    _layout.tsx
    index.tsx
  components/
  config/
  lib/firebase/
  theme/
  types/
  utils/
__tests__/
```

## Current scope

Implemented:

- Expo SDK 58 foundation
- Expo Router root layout and landing screen
- Strict TypeScript configuration
- Validated client environment configuration
- Firebase singleton initialization for app, auth, firestore, functions, and app-check
- Emulator wiring for Auth and Firestore
- App Check provider selection hooks
- Default-deny Firestore rules
- Foundational reusable UI components
- Foundational tests and lint configuration

Not implemented:

- Authentication flows
- Invite codes
- CSV import
- Notices, feeds, fan-out, or pinning
- Read tracking
- Offline queues
- Builder or buyer dashboards
- Cloud Functions
