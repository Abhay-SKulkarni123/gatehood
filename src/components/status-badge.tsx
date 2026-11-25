import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type StatusBadgeProps = {
  label: string;
  tone?: 'accent' | 'danger' | 'muted';
};

export function StatusBadge({ label, tone = 'muted' }: StatusBadgeProps) {
  const badgeTones = {
    accent: styles.accent,
    danger: styles.danger,
    muted: styles.muted,
  } as const;
  const labelTones = {
    accent: styles.accentLabel,
    danger: styles.dangerLabel,
    muted: styles.mutedLabel,
  } as const;

  return (
    <View style={[styles.badge, badgeTones[tone]]}>
      <Text style={[styles.label, labelTones[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  accent: {
    borderColor: colors.accent,
  },
  danger: {
    borderColor: colors.danger,
  },
  muted: {
    borderColor: colors.border,
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  accentLabel: {
    color: colors.accent,
  },
  dangerLabel: {
    color: colors.danger,
  },
  mutedLabel: {
    color: colors.textMuted,
  },
});
