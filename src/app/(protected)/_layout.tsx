import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ProtectedLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    />
  );
}
