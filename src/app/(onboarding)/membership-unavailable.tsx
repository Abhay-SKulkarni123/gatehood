import { StyleSheet, View } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';
import { spacing } from '@/theme';

export default function MembershipUnavailableScreen() {
  const { logout, actionPending, actionError } = useAuth();
  const { state, retry } = useMembership();
  const message =
    state.status === 'error'
      ? state.message
      : 'We could not check your project membership. Please try again.';

  return (
    <Screen>
      <View style={styles.content}>
        <ErrorState
          message={message}
          onRetry={retry}
          retryLabel="Retry membership check"
          title="Membership check unavailable"
        />
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
});
