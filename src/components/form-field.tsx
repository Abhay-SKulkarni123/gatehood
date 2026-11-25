import type { KeyboardTypeOptions } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'off';
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  numberOfLines?: number;
  error?: string | null;
  onSubmitEditing?: () => void;
};

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = 'none',
  autoComplete = 'off',
  keyboardType = 'default',
  multiline = false,
  numberOfLines,
  error,
  onSubmitEditing,
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityRole="none"
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline ? styles.multilineInput : null, error ? styles.inputError : null]}
        value={value}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
