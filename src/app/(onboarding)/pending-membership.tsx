import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { colors, spacing, typography } from '@/theme';

export default function PendingMembershipScreen() {
  const { logout, actionPending } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ACCESS PENDING</Text>
        <Text style={styles.title}>Project membership required</Text>
        <Text style={styles.message}>
          Your account is signed in, but no membership was found for this project. Contact a project
          administrator to request access.
        </Text>
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
});
