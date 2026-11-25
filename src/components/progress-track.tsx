import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme';

type ProgressTrackProps = {
  value: number;
};

export function ProgressTrack({ value }: ProgressTrackProps) {
  const bounded = Math.min(100, Math.max(0, value));

  return (
    <View
      accessible
      accessibilityLabel="Construction progress"
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: 100,
        min: 0,
        now: bounded,
        text: `${bounded}% complete`,
      }}
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${bounded}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    height: '100%',
  },
});
