import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { LoadingScreen } from '@/components/loading-screen';
import { useAccessDecision } from '@/hooks/use-access-decision';

export function GuardLayout({ children }: { children: ReactNode }) {
  const decision = useAccessDecision();

  if (decision.kind === 'loading') {
    return <LoadingScreen />;
  }

  if (decision.kind === 'redirect') {
    return <Redirect href={decision.to as Href} />;
  }

  return <>{children}</>;
}
