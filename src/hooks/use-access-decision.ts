import { usePathname } from 'expo-router';
import { decideRoute } from '@/navigation/access';
import type { AccessDecision } from '@/navigation/access';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';

export function useAccessDecision(): AccessDecision {
  const pathname = usePathname();
  const { user, authLoading } = useAuth();
  const { state: membership } = useMembership();

  return decideRoute({ pathname, user, authLoading, membership });
}
