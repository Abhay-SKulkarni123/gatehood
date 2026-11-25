import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAuth } from '@/providers/auth-provider';
import { colors, spacing, typography } from '@/theme';

export default function SignInScreen() {
  const { login, actionPending, actionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const handleSubmit = () => {
    if (actionPending || !email.trim() || !password) {
      return;
    }
    void login(email, password);
  };

  return (
    <Screen keyboardAvoiding>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GATEHOOD</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Welcome back
        </Text>
        <Text style={styles.subtitle}>Sign in to open your project workspace.</Text>
      </View>

      <View style={styles.form}>
        <FormField
          autoCapitalize="none"
          autoComplete="email"
          inputRef={emailRef}
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="you@example.com"
          returnKeyType="next"
          value={email}
        />
        <FormField
          autoCapitalize="none"
          autoComplete="password"
          inputRef={passwordRef}
          label="Password"
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
          placeholder="Enter your password"
          returnKeyType="go"
          secureTextEntry
          value={password}
        />
        {actionError ? (
          <ErrorState
            message={actionError}
            onRetry={handleSubmit}
            retryLabel="Try again"
            retryPending={actionPending}
            title="Sign-in failed"
          />
        ) : null}
        <PrimaryButton
          disabled={!email.trim() || !password}
          label="Sign in"
          loading={actionPending}
          onPress={handleSubmit}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Need an account?</Text>
        <Link href="/register" style={styles.link}>
          Register as a buyer
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
    flexWrap: 'wrap',
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
