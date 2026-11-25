import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { PrimaryButton } from '@/components/primary-button';
import { colors, spacing, typography } from '@/theme';

type WorkspaceHeaderProps = {
  accountLabel?: string;
  eyebrow: string;
  onSignOut: () => void;
  signOutError?: string | null;
  signOutPending?: boolean;
  subtitle: string;
  title: string;
};

export function WorkspaceHeader({
  accountLabel,
  eyebrow,
  onSignOut,
  signOutError,
  signOutPending = false,
  subtitle,
  title,
}: WorkspaceHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {accountLabel ? <Text style={styles.account}>{accountLabel}</Text> : null}
      {signOutError ? (
        <ErrorState
          message={signOutError}
          onRetry={onSignOut}
          retryLabel="Retry sign-out"
          retryPending={signOutPending}
          title="Sign-out failed"
        />
      ) : null}
      <PrimaryButton
        label="Sign out"
        loading={signOutPending}
        onPress={onSignOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.accent,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    fontSize: 28,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  account: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
