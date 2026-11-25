import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function ChoiceChip({ label, selected, onPress }: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.label, selected ? styles.selectedLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  selectedLabel: {
    color: colors.background,
  },
});
