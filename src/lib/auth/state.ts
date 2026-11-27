import type { AppUser } from '@/types/firebase';

export type AuthState = {
  user: AppUser | null;
  sessionId: number;
  authLoading: boolean;
  actionPending: boolean;
  actionError: string | null;
};

export type AuthStateEvent =
  | { type: 'initialized'; user: AppUser | null }
  | { type: 'userChanged'; user: AppUser | null }
  | { type: 'actionStarted' }
  | { type: 'actionSucceeded' }
  | { type: 'actionFailed'; message: string }
  | { type: 'signedOut' };

export const initialAuthState: AuthState = {
  user: null,
  sessionId: 0,
  authLoading: true,
  actionPending: false,
  actionError: null,
};

export function authStateReducer(state: AuthState, event: AuthStateEvent): AuthState {
  switch (event.type) {
    case 'initialized':
      return {
        ...state,
        user: event.user,
        sessionId: event.user ? state.sessionId + 1 : state.sessionId,
        authLoading: false,
        actionError: null,
      };
    case 'userChanged':
      return {
        ...state,
        user: event.user,
        sessionId: state.sessionId + 1,
        authLoading: false,
        actionError: null,
      };
    case 'actionStarted':
      return { ...state, actionPending: true, actionError: null };
    case 'actionSucceeded':
      return { ...state, actionPending: false, actionError: null };
    case 'actionFailed':
      return { ...state, actionPending: false, actionError: event.message };
    case 'signedOut':
      return {
        ...state,
        user: null,
        sessionId: state.sessionId + 1,
        authLoading: false,
        actionPending: false,
        actionError: null,
      };
    default:
      return state;
  }
}
