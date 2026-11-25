import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorState } from '@/components/error-state';
import { GuardLayout } from '@/components/guard-layout';
import { getClientConfig } from '@/config/env';
import { initializeFirebase } from '@/lib/firebase';
import { AuthProvider } from '@/providers/auth-provider';
import { MembershipProvider } from '@/providers/membership-provider';
import { OfflineSyncProvider } from '@/providers/offline-sync-provider';
import { colors, spacing } from '@/theme';

type BootResult =
  | { ok: true }
  | { ok: false; message: string };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to start Gatehood.';
}

function loadBoot(): BootResult {
  try {
    const config = getClientConfig();
    initializeFirebase(config);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

export default function RootLayout() {
  const [boot, setBoot] = useState<BootResult>(loadBoot);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {boot.ok ? (
          <AuthProvider>
            <OfflineSyncProvider>
              <MembershipProvider>
                <GuardLayout>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  />
                </GuardLayout>
              </MembershipProvider>
            </OfflineSyncProvider>
          </AuthProvider>
        ) : (
          <View style={styles.errorContainer}>
            <ErrorState
              title="Gatehood cannot start"
              message={boot.message}
              retryLabel="Retry startup check"
              onRetry={() => setBoot(loadBoot())}
            />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
