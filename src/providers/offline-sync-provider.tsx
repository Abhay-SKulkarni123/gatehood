import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { getClientConfig } from '@/config/env';
import { getFirebaseServices } from '@/lib/firebase';
import { callMarkNoticeRead, describeCallableError } from '@/lib/functions';
import { connectionIsUsable } from '@/lib/offline/connectivity';
import {
  enqueueRead,
  loadReadQueue,
  removeQueuedRead,
  replayReadQueue,
} from '@/lib/offline/read-queue';
import { useAuth } from './auth-provider';

type OfflineSyncContextValue = {
  isOnline: boolean;
  pendingNoticeIds: string[];
  syncError: string | null;
  queueRead: (noticeId: string) => Promise<void>;
  removePendingRead: (noticeId: string) => Promise<void>;
  refreshPending: () => Promise<void>;
  replayNow: () => Promise<void>;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const projectId = getClientConfig().constructionProjectId;
  const netInfo = useNetInfo();
  const [pendingNoticeIds, setPendingNoticeIds] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const activeUidRef = useRef(uid);

  useEffect(() => {
    activeUidRef.current = uid;
  }, [uid]);

  const refreshPending = useCallback(async () => {
    if (!uid) {
      if (activeUidRef.current === null) {
        setPendingNoticeIds([]);
      }
      return;
    }

    try {
      const queue = await loadReadQueue(uid, projectId);
      if (activeUidRef.current !== uid) {
        return;
      }
      setPendingNoticeIds(queue.map((item) => item.noticeId));
    } catch {
      if (activeUidRef.current === uid) {
        setSyncError('Unable to read pending read actions.');
      }
    }
  }, [uid, projectId]);

  const replayNow = useCallback(async () => {
    if (!uid) {
      return;
    }

    try {
      const result = await replayReadQueue(uid, projectId, (data) =>
        callMarkNoticeRead(getFirebaseServices().functions, data),
      );
      if (activeUidRef.current !== uid) {
        return;
      }
      if (result.failed > 0) {
        setSyncError(
          `${result.failed} read ${result.failed === 1 ? 'action is' : 'actions are'} still waiting to sync.`,
        );
      } else {
        setSyncError(null);
      }
      await refreshPending();
    } catch (error) {
      if (activeUidRef.current === uid) {
        setSyncError(describeCallableError(error));
      }
    }
  }, [uid, projectId, refreshPending]);

  const queueRead = useCallback(
    async (noticeId: string) => {
      if (!uid) {
        throw new Error('Sign in to save a read action.');
      }
      await enqueueRead(uid, projectId, noticeId);
      if (activeUidRef.current === uid) {
        await refreshPending();
      }
    },
    [uid, projectId, refreshPending],
  );

  const removePendingRead = useCallback(
    async (noticeId: string) => {
      if (!uid) {
        return;
      }
      await removeQueuedRead(uid, projectId, noticeId);
      if (activeUidRef.current === uid) {
        await refreshPending();
      }
    },
    [uid, projectId, refreshPending],
  );

  useEffect(() => {
    void Promise.resolve().then(refreshPending);
  }, [refreshPending]);

  useEffect(() => {
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (connectionIsUsable(state)) {
        void replayNow();
      }
    });
    const subscriptionAppState = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void replayNow();
      }
    });
    void Promise.resolve().then(replayNow);

    return () => {
      unsubscribeNetwork();
      subscriptionAppState.remove();
    };
  }, [replayNow]);

  const isOnline = connectionIsUsable(netInfo);
  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      isOnline,
      pendingNoticeIds,
      syncError,
      queueRead,
      removePendingRead,
      refreshPending,
      replayNow,
    }),
    [
      isOnline,
      pendingNoticeIds,
      syncError,
      queueRead,
      removePendingRead,
      refreshPending,
      replayNow,
    ],
  );

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync(): OfflineSyncContextValue {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within OfflineSyncProvider.');
  }
  return context;
}
