import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorState } from '@/components/error-state';
import { GuardLayout } from '@/components/guard-layout';
import { LoadingIndicator } from '@/components/loading-indicator';
import { getClientConfig } from '@/config/env';
import {
  initialBootstrapState,
  runBootstrap,
  type BootstrapState,
} from '@/lib/boot/bootstrap';
import { initializeFirebase } from '@/lib/firebase';
import { AuthProvider } from '@/providers/auth-provider';
import { MembershipProvider } from '@/providers/membership-provider';
import { OfflineSyncProvider } from '@/providers/offline-sync-provider';
import { colors, spacing } from '@/theme';

export default function RootLayout() {
  const [boot, setBoot] = useState<BootstrapState>(initialBootstrapState);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const beginBoot = useCallback(() => {
    const attempt = ++attemptRef.current;
    void runBootstrap(getClientConfig, initializeFirebase).then((nextBoot) => {
      if (mountedRef.current && attempt === attemptRef.current) {
        setBoot(nextBoot);
      }
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    beginBoot();
    return () => {
      mountedRef.current = false;
    };
  }, [beginBoot]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {boot.status === 'ready' ? (
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
        ) : boot.status === 'loading' ? (
          <LoadingIndicator label="Starting Gatehood…" />
        ) : (
          <View style={styles.errorContainer}>
            <ErrorState
              title="Gatehood cannot start"
              message={boot.message}
              retryLabel="Retry startup check"
              onRetry={beginBoot}
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
