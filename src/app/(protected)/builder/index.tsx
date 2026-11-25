import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { colors, spacing, typography } from '@/theme';

export default function BuilderHomeScreen() {
  const { user, logout, actionPending } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>BUILDER WORKSPACE</Text>
        <Text style={styles.title}>Builder access confirmed</Text>
        <Text style={styles.message}>
          Signed in as {user?.email ?? user?.uid ?? 'a builder'}. Your role was resolved from project
          membership.
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
