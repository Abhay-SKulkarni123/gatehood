import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/primary-button';
import { colors, radius, spacing, typography } from '@/theme';

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  retryLabel?: string;
  retryPending?: boolean;
  title?: string;
};

export function ErrorState({
  message,
  onRetry,
  retryDisabled = false,
  retryLabel = 'Try again',
  retryPending = false,
  title = 'Something went wrong',
}: ErrorStateProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <View style={styles.retry}>
          <PrimaryButton
            disabled={retryDisabled}
            label={retryLabel}
            loading={retryPending}
            onPress={onRetry}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    minWidth: 160,
  },
});
