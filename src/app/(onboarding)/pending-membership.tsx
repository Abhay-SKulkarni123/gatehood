import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { getClientConfig } from '@/config/env';
import { callRedeemInvite, describeCallableError } from '@/lib/functions';
import { getFirebaseServices } from '@/lib/firebase';
import { createRedemptionGate, describeInviteCodeInput } from '@/lib/invite/redemption';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';
import { colors, spacing, typography } from '@/theme';

export default function PendingMembershipScreen() {
  const { user, logout, actionPending, actionError } = useAuth();
  const { retry } = useMembership();
  const { functions } = getFirebaseServices();
  const { constructionProjectId } = getClientConfig();
  const redemptionGate = useRef(createRedemptionGate()).current;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const codeError = code.trim().length > 0 ? describeInviteCodeInput(code) : null;

  const handleRedeem = async () => {
    if (redemptionGate.isBusy()) {
      return;
    }
    const inputError = describeInviteCodeInput(code);
    if (inputError) {
      setError(inputError);
      return;
    }
    const prepared = redemptionGate.begin(code);
    if (!prepared) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callRedeemInvite(functions, {
        code: prepared.code,
        expectedProjectId: constructionProjectId,
      });
      setCode('');
      setMessage(
        result.alreadyMember
          ? `You already have access to ${result.projectId}. Opening your workspace…`
          : `Joined ${result.projectId}. Opening your workspace…`,
      );
      retry();
    } catch (redeemError) {
      setError(describeCallableError(redeemError));
    } finally {
      redemptionGate.finish();
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ACCESS PENDING</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Project membership required
        </Text>
        <Text style={styles.message}>
          Redeem an invite from your builder to join {constructionProjectId}. Membership determines
          access to this project.
        </Text>
        <Text style={styles.account}>Signed in as {user?.email ?? user?.uid ?? 'your account'}</Text>
        <FormField
          error={codeError}
          label="Invite code"
          onChangeText={setCode}
          onSubmitEditing={() => void handleRedeem()}
          placeholder="Enter the code from your builder"
          returnKeyType="go"
          value={code}
        />
        {message ? <Text accessibilityRole="status" style={styles.success}>{message}</Text> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => void handleRedeem()}
            retryLabel="Try redeeming again"
            retryPending={busy}
            title="Invite redemption failed"
          />
        ) : null}
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
          disabled={busy || !code.trim() || Boolean(codeError)}
          label="Redeem invite"
          loading={busy}
          onPress={() => void handleRedeem()}
        />
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
    color: colors.accent,
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
  account: {
    ...typography.caption,
    color: colors.textMuted,
  },
  success: {
    ...typography.caption,
    color: colors.accent,
  },
});
