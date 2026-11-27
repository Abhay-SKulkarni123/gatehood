# Gatehood

Gatehood is a React Native construction communication app. Phase 1 established the Expo/Firebase foundation with validated environment configuration, App Check wiring, emulator support, and strict TypeScript. Phase 2 added the backend foundation: Firestore schema and rules, strict domain models, callable Cloud Functions for invite redemption, notices, fan-out, pinning, and read tracking, plus emulator and security-rule tests. Phase 3 added Firebase Authentication, session-scoped membership resolution, protected Expo Router navigation, and minimal auth, onboarding, and access-confirmation screens. Phase 4 added trusted buyer CSV import, idempotent invite generation, bounded notice read-status retrieval, and functional builder and buyer workflows. Phase 5 completed invite redemption states, builder-maintained unit details, possession-day information, and realtime buyer feed filters. Phase 6 added bounded realtime feed pagination, persistent Firestore cache display, and a durable offline read queue with reconnect replay.

Feature workflows now cover buyer CSV preview/commit from a device file picker or pasted text, invite generation with active-invite reuse and explicit replacement, buyer joining with clear error/retry/membership-refresh states, builder-maintained unit configuration/progress/possession date, builder notice publishing and management, canonical read totals with sampled recipient detail, and buyer notice feeds updated in realtime and filtered by All, My Tower, or My Unit while keeping pinned-first/newest ordering. The feed starts with 15 notices, grows by 15 at a time through a single replaced listener, and uses Firestore cache metadata to label cached snapshots without keeping a second AsyncStorage feed copy. Offline read actions are persisted per UID and project, replayed through the trusted callable after connectivity or foreground return, and shown as Pending sync until the server confirms them. Imported name/phone details are stored in builder-only `buyerContacts`; buyer feeds never expose another buyer's contact information. Terminal-failure reconciliation and deployment configuration remain out of scope. See `docs/PHASE2_ARCHITECTURE.md` for the backend schema, flows, and guarantees.

## Tech stack

- Expo SDK 58 with Development Builds and local Chrome web support
- Expo Router, `expo-file-system` for native CSV selection, and a browser file input adapter for web CSV selection
- React 19.3.0 and React Native 0.88.1
- TypeScript strict mode
- React Native Firebase 27.1.1: app, auth, firestore, functions, app-check
- AsyncStorage and NetInfo for durable offline read actions and connectivity replay
- Jest and eslint-config-expo
- Firebase Emulator Suite

Expo Go is not supported because React Native Firebase uses native modules. Use an Android/iOS development build, EAS Build, or the local Chrome web target.

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

EXPO_PUBLIC_FIREBASE_API_KEY=your-web-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-firebase-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-infrastructure-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-firebase-project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-web-app-id
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-firebase-infrastructure-project-id-default-rtdb.firebaseio.com
EXPO_PUBLIC_APP_CHECK_PROVIDER=recaptchaEnterprise
EXPO_PUBLIC_APP_CHECK_SITE_KEY=your-recaptcha-site-key
EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN=
```

`EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID` is the residential construction project identifier. It is not the Firebase infrastructure project ID. `EXPO_PUBLIC_FIREBASE_PROJECT_ID` is the Firebase infrastructure project ID and must match the Firebase web app configuration. `EXPO_PUBLIC_FIREBASE_DATABASE_URL` is optional for web; when omitted, Gatehood derives the default Realtime Database URL from the infrastructure project ID because React Native Firebase requires a `databaseURL` string during initialization. `EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` is required only for local web development with deployed-style App Check enforcement and must be registered in Firebase Console.

`EXPO_PUBLIC_FUNCTIONS_REGION` is the Cloud Functions deployment region. Web App Check requires the explicit `EXPO_PUBLIC_APP_CHECK_PROVIDER=recaptchaEnterprise` identifier and a Google Cloud reCAPTCHA Enterprise `EXPO_PUBLIC_APP_CHECK_SITE_KEY` for all web builds, including development. For local web development and emulator use, also set `EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` to a debug token registered in Firebase Console; Gatehood applies it before App Check initialization and clears it outside local development. The SDK no longer generates a substitute token automatically.

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

App Check is initialized from `src/lib/firebase/index.ts` through a singleton Firebase module. It is initialized immediately after the Firebase app is ready and before `getAuth()`, `getFirestore()`, or `getFunctions()` are called, and initialization is cached so repeated calls and retries do not initialize it again. On native debug builds, the Android and Apple debug providers are selected. On native release builds, Play Integrity and App Attest with DeviceCheck fallback are selected. All web builds initialize `ReCaptchaEnterpriseProvider` with the configured Google Cloud reCAPTCHA Enterprise site key. In local development, a validated `EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` is applied to `globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN` before initialization; it is ignored outside local development. All callable functions in `functions/src/index.ts` use `enforceAppCheck: true`, so production calls require valid App Check tokens once the Firebase apps are registered.

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

Chrome web development:

```bash
npx firebase emulators:start --project demo-gatehood
npx expo start --web
```

Open the URL Expo reports, normally `http://localhost:8081`. Keep `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true` for local QA against the emulators. Web uses `127.0.0.1` for emulator hosts. Register a web App Check debug token in Firebase Console (App Check → your web app → Manage debug tokens), copy it into `EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN`, and restart Expo. Gatehood applies that token before App Check initialization; a missing or invalid token fails fast with a retryable configuration error. Do not commit the token. Non-development web builds use reCAPTCHA attestation with the configured site key instead.

Seed local builder and buyer users plus the `demo-project` membership records from a separate terminal while the emulators are running:

```powershell
$env:GCLOUD_PROJECT = 'demo-gatehood'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:GATEHOOD_EMULATOR_TEST_PASSWORD = '<local test password>'
npm run seed:emulator
```

The seed command refuses non-local emulator hosts and writes only to the emulator. It creates `builder@gatehood.test` and `buyer@gatehood.test` using the password from `GATEHOOD_EMULATOR_TEST_PASSWORD`; the password is not printed or stored in the repository. In Firebase Console, register the browser debug token for App Check if you want to exercise deployed callables; the Functions emulator does not enforce App Check.

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
npx firebase emulators:start --project demo-gatehood
```

Emulator ports:

- Auth: `9099`
- Firestore: `8080`
- Functions: `5001`
- Emulator UI: `5000`

The client connects Auth, Firestore, and Functions to emulators only when `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`. On web, both the React Native Firebase lite instance and the full Firestore SDK instance used by the realtime buyer feed are connected to the Firestore emulator. Firestore rules are least-privilege and deny all client writes to canonical data. Native builds initialize Firestore persistence; other web reads use the React Native Firebase Firestore web fallback and its lite SDK, so native-style persistent cache metadata is not available outside the buyer feed in Chrome. The buyer feed uses the full Firebase JavaScript Firestore SDK on the same initialized web app so `onSnapshot()` realtime updates and `metadata.fromCache` work with the existing feed contract. Browser Auth uses the Firebase web SDK's default browser session persistence.

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
    offline/
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
  - Trusted buyer CSV import preview/commit callables with bounded, all-or-nothing writes to towers, units, and builder-only buyer contacts
  - Device CSV file selection plus client-side row validation before callable preview/commit
  - Builder-authorized invite generation with transactional per-unit slots, active-invite reuse, explicit replacement/revocation, and plaintext returned only when newly created
  - Builder-authorized notice read-status retrieval with paginated audience filtering, canonical totals, and explicitly labeled/truncated recipient samples
  - Builder workspace with project stats, buyer import, invite generation/replacement, buyer status, notice composer, pin management, and read-status views
  - Buyer invite redemption screen and buyer notice feed ordered by pin state then delivery time
  - Typed callable wrappers, repositories, and pure client helpers for Phase 4 workflows
  - Duplicate-submission guarded invite redemption with local code validation, safe callable errors, retryable failures, and membership refresh after success
  - Builder-maintained unit configuration, construction progress, and possession date through an authorized App Check callable
  - Buyer unit detail display with explicit unavailable states and calendar-day possession information
  - Realtime buyer feed subscription with All, My Tower, and My Unit filters over delivered notices only
  - Growing-limit buyer feed pagination with one indexed listener, dedupe, and replaced subscriptions
  - Persistent native Firestore cache with cached-snapshot status and explicit retry/error states
  - Durable per-UID/per-project offline read queue with connectivity/foreground replay through `markNoticeRead`
  - Pending sync, unread, and confirmed-read states that do not report local-only reads as server-confirmed

Not implemented:

- Reconciliation jobs for terminal failures and counter drift
- Firebase Hosting/deployment configuration beyond local emulators
- Native-device/offline-mode manual verification outside Jest and emulator coverage
