import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingIndicator } from '@/components/loading-indicator';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { getClientConfig } from '@/config/env';
import { loadBuyerFeed } from '@/lib/data/buyer';
import { callMarkNoticeRead, describeCallableError } from '@/lib/functions';
import { getFirebaseServices } from '@/lib/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';
import type { FeedEntryDoc, FirestoreTimestamp } from '@/types/domain';
import { colors, radius, spacing, typography } from '@/theme';

function formatTimestamp(value: FirestoreTimestamp): string {
  return value.toDate().toLocaleString();
}

export default function BuyerHomeScreen() {
  const { user, logout, actionPending } = useAuth();
  const { state: membership } = useMembership();
  const { constructionProjectId } = getClientConfig();
  const uid = user?.uid ?? null;

  const [entries, setEntries] = useState<FeedEntryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = async (showLoading: boolean) => {
    if (!uid) {
      return;
    }
    if (showLoading) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const { firestore } = getFirebaseServices();
      setEntries(await loadBuyerFeed(firestore, uid, constructionProjectId));
    } catch (feedError) {
      setLoadError(describeCallableError(feedError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!uid) {
      return;
    }
    let active = true;
    const run = async () => {
      try {
        const { firestore } = getFirebaseServices();
        const data = await loadBuyerFeed(firestore, uid, constructionProjectId);
        if (active) {
          setEntries(data);
        }
      } catch (feedError) {
        if (active) {
          setLoadError(describeCallableError(feedError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [constructionProjectId, uid]);

  const handleMarkRead = async (noticeId: string) => {
    setBusyNoticeId(noticeId);
    setError(null);
    try {
      await callMarkNoticeRead(getFirebaseServices().functions, {
        projectId: constructionProjectId,
        noticeId,
      });
      await loadFeed(false);
    } catch (readError) {
      setError(describeCallableError(readError));
    } finally {
      setBusyNoticeId(null);
    }
  };

  const membershipRecord = membership.status === 'ready' ? membership.membership : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BUYER WORKSPACE</Text>
        <Text style={styles.title}>Project updates</Text>
        <Text style={styles.subtitle}>
          Signed in as {user?.email ?? user?.uid ?? 'a buyer'}. Notices arrive here for your unit.
        </Text>
        <PrimaryButton label="Sign out" loading={actionPending} onPress={() => void logout()} />
      </View>

      {error ? <ErrorState message={error} title="Action failed" /> : null}

      {membershipRecord ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>My unit</Text>
          <Text style={styles.detail}>Project: {membershipRecord.projectId}</Text>
          <Text style={styles.detail}>Tower: {membershipRecord.towerId ?? 'Not assigned'}</Text>
          <Text style={styles.detail}>Unit: {membershipRecord.unitId ?? 'Not assigned'}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notices</Text>
        {loading ? (
          <LoadingIndicator label="Loading notices…" />
        ) : loadError ? (
          <ErrorState
            message={loadError}
            onRetry={() => void loadFeed(true)}
            retryLabel="Reload notices"
            title="Notices unavailable"
          />
        ) : entries.length === 0 ? (
          <EmptyState message="Your builder has not published a notice for this unit yet." title="No notices" />
        ) : (
          entries.map((entry) => (
            <View key={entry.noticeId} style={styles.notice}>
              <View style={styles.noticeHeader}>
                <Text style={styles.noticeTitle}>{entry.title}</Text>
                {entry.pinned ? <Text style={styles.pinned}>Pinned</Text> : null}
              </View>
              <Text style={styles.body}>{entry.body}</Text>
              <Text style={styles.detail}>Delivered {formatTimestamp(entry.deliveredAt)}</Text>
              {entry.readAt === null ? (
                <PrimaryButton
                  label="Mark as read"
                  loading={busyNoticeId === entry.noticeId}
                  onPress={() => void handleMarkRead(entry.noticeId)}
                />
              ) : (
                <Text style={styles.read}>Read {formatTimestamp(entry.readAt)}</Text>
              )}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.accent,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    fontSize: 28,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  detail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  notice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noticeTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  pinned: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  read: {
    ...typography.caption,
    color: colors.accent,
  },
});
