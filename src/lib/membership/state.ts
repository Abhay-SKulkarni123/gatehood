import type { MembershipDoc } from '@/types/domain';

export type MembershipState =
  | { status: 'anonymous' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; membership: MembershipDoc }
  | { status: 'invalid' }
  | { status: 'error'; message: string; retryable: boolean };

export const anonymousMembershipState: MembershipState = { status: 'anonymous' };
export const loadingMembershipState: MembershipState = { status: 'loading' };
