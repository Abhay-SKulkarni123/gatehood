import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type SectionCardProps = {
  children: ReactNode;
  helper?: string;
  title: string;
};

export function SectionCard({ children, helper, title }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
