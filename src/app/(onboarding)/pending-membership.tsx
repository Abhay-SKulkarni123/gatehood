import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { getClientConfig } from '@/config/env';
import { callRedeemInvite, describeCallableError } from '@/lib/functions';
import { getFirebaseServices } from '@/lib/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';
import { colors, spacing, typography } from '@/theme';

export default function PendingMembershipScreen() {
  const { user, logout, actionPending } = useAuth();
  const { retry } = useMembership();
  const { functions } = getFirebaseServices();
  const { constructionProjectId } = getClientConfig();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleRedeem = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callRedeemInvite(functions, { code: code.trim() });
      setCode('');
      setMessage(`Joined ${result.projectId}. Opening your workspace…`);
      retry();
    } catch (redeemError) {
      setError(describeCallableError(redeemError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ACCESS PENDING</Text>
        <Text style={styles.title}>Project membership required</Text>
        <Text style={styles.message}>
          Redeem an invite from your builder to join {constructionProjectId}. Membership determines
          access to this project.
        </Text>
        <Text style={styles.account}>Signed in as {user?.email ?? user?.uid ?? 'your account'}</Text>
        <FormField
          label="Invite code"
          onChangeText={setCode}
          placeholder="Enter the code from your builder"
          value={code}
        />
        {message ? <Text accessibilityRole="status" style={styles.success}>{message}</Text> : null}
        {error ? <ErrorState message={error} title="Invite redemption failed" /> : null}
        <PrimaryButton
          disabled={!code.trim()}
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
