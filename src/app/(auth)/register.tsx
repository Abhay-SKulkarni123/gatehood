import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { colors, spacing, typography } from '@/theme';

export default function RegisterScreen() {
  const { registerBuyer, actionPending, actionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = () => {
    if (actionPending) {
      return;
    }
    void registerBuyer({ email, password, confirmPassword });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BUYER ACCESS</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>
          Register with your email. Project membership is granted separately and determines access.
        </Text>
      </View>

      <View style={styles.form}>
        <FormField
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <FormField
          autoCapitalize="none"
          autoComplete="password"
          label="Password"
          onChangeText={setPassword}
          placeholder="At least 8 characters with a letter and number"
          secureTextEntry
          value={password}
        />
        <FormField
          autoCapitalize="none"
          autoComplete="password"
          label="Confirm password"
          onChangeText={setConfirmPassword}
          onSubmitEditing={handleSubmit}
          placeholder="Repeat your password"
          secureTextEntry
          value={confirmPassword}
        />
        {actionError ? (
          <ErrorState
            message={actionError}
            onRetry={handleSubmit}
            retryLabel="Try again"
            title="Registration failed"
          />
        ) : null}
        <PrimaryButton
          disabled={!email.trim() || !password || !confirmPassword}
          label="Create buyer account"
          loading={actionPending}
          onPress={handleSubmit}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already registered?</Text>
        <Link href="/sign-in" style={styles.link}>
          Sign in
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.accent,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    fontSize: 32,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  form: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  link: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
});
