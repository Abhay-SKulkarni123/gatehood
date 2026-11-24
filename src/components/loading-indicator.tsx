import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/theme';

type LoadingIndicatorProps = {
  label?: string;
};

export function LoadingIndicator({ label = 'Loading…' }: LoadingIndicatorProps) {
  return (
    <View style={styles.container} accessibilityRole="status">
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
