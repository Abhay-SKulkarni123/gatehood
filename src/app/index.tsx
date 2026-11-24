import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/screen';
import { getClientConfig } from '@/config/env';
import { colors, radius, spacing, typography } from '@/theme';

export default function HomeScreen() {
  const config = getClientConfig();
  const modeLabel = config.useFirebaseEmulator ? 'Emulator mode' : 'Cloud mode';

  return (
    <Screen>
      <View style={styles.brandRow}>
        <View style={styles.mark}>
          <Text style={styles.markLabel}>GH</Text>
        </View>
        <Text style={styles.eyebrow}>CONSTRUCTION COMMUNICATION</Text>
      </View>

      <Text style={styles.title}>Gatehood</Text>
      <Text style={styles.subtitle}>
        One place for project updates, buyer records, and unit communication.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACTIVE CONSTRUCTION PROJECT</Text>
        <Text style={styles.cardValue}>{config.constructionProjectId}</Text>
        <View style={styles.divider} />
        <Text style={styles.cardLabel}>FIREBASE SESSION</Text>
        <Text style={styles.cardValueSmall}>{modeLabel}</Text>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Phase 1 foundation running</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  markLabel: {
    ...typography.heading,
    color: colors.background,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.accent,
    flexShrink: 1,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.xl,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  cardLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
    fontSize: 10,
  },
  cardValue: {
    ...typography.heading,
    color: colors.text,
  },
  cardValueSmall: {
    ...typography.caption,
    color: colors.text,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.sm,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statusDot: {
    backgroundColor: colors.accent,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  statusText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
