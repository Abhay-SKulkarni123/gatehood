import type { MembershipState } from '@/lib/membership/state';
import type { Role } from '@/types/domain';

export const ROUTES = {
  root: '/',
  signIn: '/sign-in',
  register: '/register',
  builder: '/builder',
  buyer: '/buyer',
  pendingMembership: '/pending-membership',
  accessDenied: '/access-denied',
  membershipUnavailable: '/membership-unavailable',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export type AccessContext = {
  pathname: string;
  user: { uid: string } | null;
  authLoading: boolean;
  membership: MembershipState;
};

export type AccessDecision =
  | { kind: 'loading' }
  | { kind: 'allow' }
  | { kind: 'redirect'; to: AppRoute };

function normalizePath(pathname: string): string {
  if (pathname.length <= 1) {
    return ROUTES.root;
  }
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || ROUTES.root;
}

function isWithin(pathname: string, route: AppRoute): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isAuthRoute(pathname: string): boolean {
  return isWithin(pathname, ROUTES.signIn) || isWithin(pathname, ROUTES.register);
}

function homeForRole(role: Role): AppRoute {
  return role === 'builder' ? ROUTES.builder : ROUTES.buyer;
}

export function decideRoute({
  pathname,
  user,
  authLoading,
  membership,
}: AccessContext): AccessDecision {
  const path = normalizePath(pathname);

  if (authLoading) {
    return { kind: 'loading' };
  }

  if (!user) {
    return isAuthRoute(path)
      ? { kind: 'allow' }
      : { kind: 'redirect', to: ROUTES.signIn };
  }

  if (membership.status === 'anonymous' || membership.status === 'loading') {
    return { kind: 'loading' };
  }

  if (membership.status === 'missing') {
    return isWithin(path, ROUTES.pendingMembership)
      ? { kind: 'allow' }
      : { kind: 'redirect', to: ROUTES.pendingMembership };
  }

  if (membership.status === 'invalid') {
    return isWithin(path, ROUTES.accessDenied)
      ? { kind: 'allow' }
      : { kind: 'redirect', to: ROUTES.accessDenied };
  }

  if (membership.status === 'error') {
    return isWithin(path, ROUTES.membershipUnavailable)
      ? { kind: 'allow' }
      : { kind: 'redirect', to: ROUTES.membershipUnavailable };
  }

  const home = homeForRole(membership.membership.role);
  if (isWithin(path, home)) {
    return { kind: 'allow' };
  }
  return { kind: 'redirect', to: home };
}
