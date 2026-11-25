# Gatehood

Gatehood is a React Native construction communication app. Phase 1 established the Expo/Firebase foundation with validated environment configuration, App Check wiring, emulator support, and strict TypeScript. Phase 2 added the backend foundation: Firestore schema and rules, strict domain models, callable Cloud Functions for invite redemption, notices, fan-out, pinning, and read tracking, plus emulator and security-rule tests. Phase 3 added Firebase Authentication, session-scoped membership resolution, protected Expo Router navigation, and minimal auth, onboarding, and access-confirmation screens. Phase 4 added trusted CSV import, invite generation, and notice read-status callables plus functional builder and buyer workflows.

Feature workflows now cover unit import and preview, invite generation, buyer joining, builder notice publishing and management, notice read status, and buyer notice feeds with first-read actions. Offline feed support, terminal-failure reconciliation, large-project pagination, and deployment configuration remain out of scope. See `docs/PHASE2_ARCHITECTURE.md` for the backend schema, flows, and guarantees.

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

`EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true` points Auth, Firestore, and Functions at local emulators. Android cleartext HTTP is enabled only for local development and EAS `development` builds when this flag is exactly `true`; EAS `preview` and `production` builds remain restricted even if the flag is mistakenly set. App Check has no emulator; callable functions are declared with App Check enforcement for deployed environments.

### Backend and deployment variables

These configure backend deployment and tools:

```text
FIREBASE_PROJECT_ID=your-firebase-project-id
CONSTRUCTION_PROJECT_ID=demo-project
FUNCTIONS_REGION=us-central1
```

`FIREBASE_PROJECT_ID` identifies Firebase infrastructure. `CONSTRUCTION_PROJECT_ID` identifies the residential project. Do not use them interchangeably.

Missing or invalid client configuration produces a startup error in the app with a retry action.

### Android cleartext traffic

`app.config.js` sets the `expo-build-properties` value `android.usesCleartextTraffic` to `true` only when `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` is exactly `true` and either `EAS_BUILD_PROFILE` is unset/empty (local development) or exactly `development`. EAS `preview` and `production` profiles always resolve to `false`, even if the emulator flag is mistakenly set. Any profile with the emulator flag `false` or unset also resolves to `false`. The iOS dynamic framework configuration is unchanged.

Verify with these exact invocations:

```bash
env -u EAS_BUILD_PROFILE EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true npx expo config --type public
EAS_BUILD_PROFILE=development EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true npx expo config --type public
EAS_BUILD_PROFILE=preview EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true npx expo config --type public
EAS_BUILD_PROFILE=production EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true npx expo config --type public
EAS_BUILD_PROFILE=production env -u EXPO_PUBLIC_USE_FIREBASE_EMULATOR npx expo config --type public
```

Local Expo CLI commands such as `npx expo run:android` must leave `EAS_BUILD_PROFILE` unset and set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true` to permit emulator HTTP traffic.

## Firebase configuration

A real Firebase project is not connected in this repository. Native builds require your own Firebase app configuration files placed at the repository root:

```text
./google-services.json
./GoogleService-Info.plist
```

The Android package is `com.gatehood.app` and the iOS bundle identifier is `com.gatehood.app`. Your Firebase apps must use matching identifiers.

App Check is initialized from `src/lib/firebase/index.ts` through a singleton Firebase module. It is initialized immediately after `getApp()` and before `getAuth()`, `getFirestore()`, or `getFunctions()` are called, and it is cached so repeated calls and retries do not initialize it again. In debug builds, the Android and Apple debug providers are selected. In release builds, Play Integrity and App Attest with DeviceCheck fallback are selected as the intended provider configuration. All callable functions in `functions/src/index.ts` use `enforceAppCheck: true`, so production calls require valid App Check tokens once the Firebase apps are registered.

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
npx firebase emulators:start
```

Emulator ports:

- Auth: `9099`
- Firestore: `8080`
- Functions: `5001`
- Emulator UI: `5000`

The client connects Auth, Firestore, and Functions to emulators only when `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`. Firestore rules are least-privilege and deny all client writes to canonical data.

Backend verification:

```bash
npm run build:functions
npm run typecheck:functions
npm run test:backend
npm run test:rules
```

`npm run test:backend` builds Functions first, starts Auth/Firestore/Functions emulators with `demo-gatehood`, and runs Jest. It uses local `firebase-tools`; no global install is required.

The `retryFanoutFailures` scheduled function runs every 5 minutes in UTC, processes unresolved retryable failures in bounded batches, and uses a Firestore lease to reduce overlapping executions. Internal retry helpers are not public callables. See `docs/PHASE2_ARCHITECTURE.md` for trade-offs.

## Folder structure

```text
app.config.js
firebase.json
firestore.rules
firestore.indexes.json
jest.config.js
docs/
  PHASE2_ARCHITECTURE.md
functions/
  src/
    domain/
    services/
    index.ts
  test/
src/
  app/
    _layout.tsx
    index.tsx
    (auth)/
      sign-in.tsx
      register.tsx
    (onboarding)/
      pending-membership.tsx
      access-denied.tsx
      membership-unavailable.tsx
    (protected)/
      builder/index.tsx
      buyer/index.tsx
  components/
  config/
  hooks/
  lib/
    auth/
    data/
    firebase/
    functions/
    membership/
  navigation/
  providers/
  theme/
  types/
  utils/
__tests__/
```

## Current scope

Implemented:

- Expo SDK 58 foundation and development-build Firebase setup
- Expo Router root layout with session-scoped route guarding
- Strict TypeScript configuration for app and Functions
- Validated client environment configuration
- Firebase singleton initialization for app, auth, firestore, functions, and app-check
- Emulator wiring for Auth, Firestore, and Functions
- App Check provider selection hooks and enforced callable options
- Least-privilege Firestore rules
- Strict shared domain models and Zod validation
- Callable invite redemption with hashed, single-use codes
- Canonical notices with recipient fan-out, kind-scoped stable failure records, and scheduled retries
- Idempotent pin propagation using the latest canonical state
- Transactional first-read counting
- Backend and security-rule emulator tests
- Email/password sign-in
- Buyer email/password registration
- Firebase Auth state subscription and provider
- Membership-based role resolution from `projects/{projectId}/members/{uid}`
- Protected Expo Router navigation for builder and buyer roles
- Pending-membership, access-denied, and membership-unavailable screens
  - Minimal builder and buyer access-confirmation placeholders
  - Foundational reusable UI components, auth/membership/route tests, and lint/test configuration
  - Trusted CSV import preview/commit callables with bounded, all-or-nothing unit writes
  - Builder-authorized invite generation that returns the code once and stores only its hash
  - Builder-authorized notice read-status retrieval with bounded recipient detail
  - Builder workspace with project stats, unit import, invite generation, buyer status, notice composer, pin management, and read-status views
  - Buyer invite redemption screen and buyer notice feed with mark-as-read actions
  - Typed callable wrappers and client repositories for Phase 4 workflows

Not implemented:

- Offline feed support and read queue UI
- Reconciliation jobs for terminal failures and counter drift
- Pagination beyond bounded collection reads for very large projects
- Firebase Hosting/deployment configuration beyond local emulators
