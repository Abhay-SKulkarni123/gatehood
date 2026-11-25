import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { colors, spacing, typography } from '@/theme';

export default function AccessDeniedScreen() {
  const { logout, actionPending, actionError } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ACCESS DENIED</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Membership record is invalid
        </Text>
        <Text style={styles.message}>
          Your account has a membership record that Gatehood cannot recognize. Contact a project
          administrator to correct it.
        </Text>
        {actionError ? (
          <ErrorState
            message={actionError}
            onRetry={() => void logout()}
            retryLabel="Retry sign-out"
            retryPending={actionPending}
            title="Sign-out failed"
          />
        ) : null}
        <PrimaryButton
          label="Sign out"
          loading={actionPending}
          onPress={() => void logout()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.danger,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    fontSize: 28,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
});
