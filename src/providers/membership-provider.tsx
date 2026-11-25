import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getClientConfig } from '@/config/env';
import { getFirebaseServices } from '@/lib/firebase';
import { loadMembership } from '@/lib/membership/repository';
import { anonymousMembershipState, loadingMembershipState } from '@/lib/membership/state';
import type { MembershipState } from '@/lib/membership/state';
import { useAuth } from './auth-provider';

type MembershipContextValue = {
  state: MembershipState;
  retry: () => void;
};

type LookupResult = {
  sessionId: number;
  uid: string;
  attempt: number;
  state: MembershipState;
};

const MembershipContext = createContext<MembershipContextValue | null>(null);

export function MembershipProvider({ children }: { children: ReactNode }) {
  const { user, sessionId } = useAuth();
  const userUid = user?.uid ?? null;
  const currentSessionId = userUid ? sessionId : null;
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  useEffect(() => {
    if (currentSessionId === null || !userUid) {
      return;
    }

    let active = true;
    const lookupSessionId = currentSessionId;
    const lookupUid = userUid;
    const { firestore } = getFirebaseServices();
    const { constructionProjectId } = getClientConfig();

    void loadMembership(firestore, constructionProjectId, lookupUid).then((result) => {
      if (active) {
        setLookup({
          sessionId: lookupSessionId,
          uid: lookupUid,
          attempt,
          state: result,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [currentSessionId, userUid, attempt]);

  const state = useMemo<MembershipState>(() => {
    if (currentSessionId === null || !userUid) {
      return anonymousMembershipState;
    }
    if (
      lookup?.sessionId === currentSessionId &&
      lookup.uid === userUid &&
      lookup.attempt === attempt
    ) {
      return lookup.state;
    }
    return loadingMembershipState;
  }, [currentSessionId, userUid, attempt, lookup]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<MembershipContextValue>(() => ({ state, retry }), [state, retry]);

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}

export function useMembership(): MembershipContextValue {
  const context = useContext(MembershipContext);
  if (!context) {
    throw new Error('useMembership must be used within MembershipProvider.');
  }
  return context;
}
