import { decideRoute, ROUTES } from '@/navigation/access';
import type { MembershipState } from '@/lib/membership/state';
import type { MembershipDoc } from '@/types/domain';

const user = { uid: 'uid-1' };
const readyBuilder: MembershipState = {
  status: 'ready',
  membership: { role: 'builder' } as unknown as MembershipDoc,
};
const readyBuyer: MembershipState = {
  status: 'ready',
  membership: { role: 'buyer' } as unknown as MembershipDoc,
};

function context(overrides: Partial<Parameters<typeof decideRoute>[0]> = {}) {
  return {
    pathname: ROUTES.root,
    user,
    authLoading: false,
    membership: readyBuyer,
    ...overrides,
  };
}

test('signed-out deep links redirect to sign-in while auth routes stay open', () => {
  expect(decideRoute(context({ pathname: '/builder', user: null }))).toEqual({
    kind: 'redirect',
    to: ROUTES.signIn,
  });
  expect(decideRoute(context({ pathname: '/sign-in', user: null }))).toEqual({ kind: 'allow' });
  expect(decideRoute(context({ pathname: '/register', user: null }))).toEqual({ kind: 'allow' });
});

test('auth and membership loading never render protected content', () => {
  expect(decideRoute(context({ pathname: '/builder', authLoading: true }))).toEqual({
    kind: 'loading',
  });
  expect(
    decideRoute(context({ pathname: '/buyer', membership: { status: 'loading' } })),
  ).toEqual({ kind: 'loading' });
  expect(
    decideRoute(context({ pathname: '/builder', membership: { status: 'anonymous' } })),
  ).toEqual({ kind: 'loading' });
});

test('missing, invalid, and unavailable membership routes are isolated', () => {
  expect(decideRoute(context({ membership: { status: 'missing' } }))).toEqual({
    kind: 'redirect',
    to: ROUTES.pendingMembership,
  });
  expect(
    decideRoute(
      context({
        pathname: ROUTES.pendingMembership,
        membership: { status: 'missing' },
      }),
    ),
  ).toEqual({ kind: 'allow' });

  expect(decideRoute(context({ membership: { status: 'invalid' } }))).toEqual({
    kind: 'redirect',
    to: ROUTES.accessDenied,
  });
  expect(
    decideRoute(
      context({
        pathname: ROUTES.membershipUnavailable,
        membership: {
          status: 'error',
          message: 'Unavailable',
          retryable: true,
        },
      }),
    ),
  ).toEqual({ kind: 'allow' });
  expect(
    decideRoute(
      context({
        membership: {
          status: 'error',
          message: 'Unavailable',
          retryable: true,
        },
      }),
    ),
  ).toEqual({ kind: 'redirect', to: ROUTES.membershipUnavailable });
});

test('builders only enter builder routes and buyers only enter buyer routes', () => {
  expect(decideRoute(context({ pathname: ROUTES.root, membership: readyBuilder }))).toEqual({
    kind: 'redirect',
    to: ROUTES.builder,
  });
  expect(decideRoute(context({ pathname: ROUTES.builder, membership: readyBuilder }))).toEqual({
    kind: 'allow',
  });
  expect(decideRoute(context({ pathname: '/builder/units', membership: readyBuilder }))).toEqual({
    kind: 'allow',
  });
  expect(decideRoute(context({ pathname: '/buyer', membership: readyBuilder }))).toEqual({
    kind: 'redirect',
    to: ROUTES.builder,
  });
  expect(decideRoute(context({ pathname: '/sign-in', membership: readyBuilder }))).toEqual({
    kind: 'redirect',
    to: ROUTES.builder,
  });
  expect(decideRoute(context({ pathname: '/buyer/', membership: readyBuyer }))).toEqual({
    kind: 'allow',
  });
  expect(decideRoute(context({ pathname: '/builder', membership: readyBuyer }))).toEqual({
    kind: 'redirect',
    to: ROUTES.buyer,
  });
  expect(decideRoute(context({ pathname: '/unknown', membership: readyBuyer }))).toEqual({
    kind: 'redirect',
    to: ROUTES.buyer,
  });
});
