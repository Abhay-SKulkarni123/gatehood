import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import type { User } from '@react-native-firebase/auth';
import { describeAuthError } from '@/lib/auth/errors';
import {
  loginWithEmailPassword,
  logoutUser,
  registerBuyer as registerBuyerAccount,
} from '@/lib/auth/service';
import type { BuyerRegistration } from '@/lib/auth/service';
import { subscribeToAuthState } from '@/lib/auth/subscription';
import { authStateReducer, initialAuthState } from '@/lib/auth/state';
import { getFirebaseServices } from '@/lib/firebase';

type AuthContextValue = {
  user: User | null;
  sessionId: number;
  authLoading: boolean;
  actionPending: boolean;
  actionError: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerBuyer: (input: BuyerRegistration) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authStateReducer, initialAuthState);
  const actionBusyRef = useRef(false);
  const receivedInitialUserRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(getFirebaseServices().auth, (user) => {
      dispatch({
        type: receivedInitialUserRef.current ? 'userChanged' : 'initialized',
        user,
      });
      receivedInitialUserRef.current = true;
    });
    return unsubscribe;
  }, []);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (actionBusyRef.current) {
      return;
    }
    actionBusyRef.current = true;
    dispatch({ type: 'actionStarted' });
    try {
      await action();
      dispatch({ type: 'actionSucceeded' });
    } catch (error) {
      dispatch({ type: 'actionFailed', message: describeAuthError(error) });
    } finally {
      actionBusyRef.current = false;
    }
  }, []);

  const login = useCallback(
    (email: string, password: string) => runAction(() => loginWithEmailPassword(email, password)),
    [runAction],
  );

  const registerBuyer = useCallback(
    (input: BuyerRegistration) => runAction(() => registerBuyerAccount(input)),
    [runAction],
  );

  const logout = useCallback(
    () =>
      runAction(async () => {
        await logoutUser();
        dispatch({ type: 'signedOut' });
      }),
    [runAction],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      sessionId: state.sessionId,
      authLoading: state.authLoading,
      actionPending: state.actionPending,
      actionError: state.actionError,
      login,
      registerBuyer,
      logout,
    }),
    [state, login, registerBuyer, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
