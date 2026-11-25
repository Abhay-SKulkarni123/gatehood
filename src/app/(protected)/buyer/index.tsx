import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingIndicator } from '@/components/loading-indicator';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { getClientConfig } from '@/config/env';
import { subscribeBuyerFeed } from '@/lib/data/buyer';
import {
  describeConstructionProgress,
  describePossessionDate,
  loadBuyerUnit,
} from '@/lib/data/units';
import { filterBuyerFeed, type BuyerFeedFilter } from '@/lib/data/sort';
import { callMarkNoticeRead, describeCallableError } from '@/lib/functions';
import { getFirebaseServices } from '@/lib/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';
import type { FeedEntryDoc, FirestoreTimestamp, UnitDoc } from '@/types/domain';
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
  const [feedRetryKey, setFeedRetryKey] = useState(0);
  const [feedFilter, setFeedFilter] = useState<BuyerFeedFilter>('all');
  const [unit, setUnit] = useState<UnitDoc | null>(null);
  const [unitLoading, setUnitLoading] = useState(true);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const membershipRecord = membership.status === 'ready' ? membership.membership : null;

  useEffect(() => {
    if (!uid) {
      return;
    }
    try {
      const { firestore } = getFirebaseServices();
      return subscribeBuyerFeed(
        firestore,
        uid,
        constructionProjectId,
        (data) => {
          setEntries(data);
          setLoading(false);
        },
        (feedError) => {
          setLoadError(describeCallableError(feedError));
          setLoading(false);
        },
      );
    } catch (feedError) {
      const message = describeCallableError(feedError);
      void Promise.resolve().then(() => {
        setLoadError(message);
        setLoading(false);
      });
      return undefined;
    }
  }, [constructionProjectId, uid, feedRetryKey]);

  useEffect(() => {
    if (!membershipRecord) {
      return;
    }

    let active = true;
    const run = async () => {
      setUnitLoading(true);
      setUnitError(null);
      try {
        const { firestore } = getFirebaseServices();
        const data = await loadBuyerUnit(firestore, membershipRecord);
        if (active) {
          setUnit(data);
        }
      } catch (unitLoadError) {
        if (active) {
          setUnitError(describeCallableError(unitLoadError));
        }
      } finally {
        if (active) {
          setUnitLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [membershipRecord]);

  const filteredEntries = useMemo(
    () => filterBuyerFeed(entries, membershipRecord, feedFilter),
    [entries, membershipRecord, feedFilter],
  );

  const handleMarkRead = async (noticeId: string) => {
    setBusyNoticeId(noticeId);
    setError(null);
    try {
      await callMarkNoticeRead(getFirebaseServices().functions, {
        projectId: constructionProjectId,
        noticeId,
      });
    } catch (readError) {
      setError(describeCallableError(readError));
    } finally {
      setBusyNoticeId(null);
    }
  };

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
          {unitLoading ? (
            <LoadingIndicator label="Loading unit details…" />
          ) : unitError ? (
            <ErrorState message={unitError} title="Unit details unavailable" />
          ) : (
            <>
              <Text style={styles.detail}>
                Configuration: {unit?.configuration ?? 'Not available'}
              </Text>
              <Text style={styles.detail}>
                Construction: {describeConstructionProgress(unit?.constructionProgress)}
              </Text>
              <Text style={styles.detail}>{describePossessionDate(unit?.possessionDate)}</Text>
              {unit === null ? (
                <Text style={styles.detail}>Your builder has not added these details yet.</Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notices</Text>
        <View style={styles.chipRow}>
          <ChoiceChip
            label="All"
            onPress={() => setFeedFilter('all')}
            selected={feedFilter === 'all'}
          />
          <ChoiceChip
            label="My tower"
            onPress={() => setFeedFilter('tower')}
            selected={feedFilter === 'tower'}
          />
          <ChoiceChip
            label="My unit"
            onPress={() => setFeedFilter('unit')}
            selected={feedFilter === 'unit'}
          />
        </View>
        {loading ? (
          <LoadingIndicator label="Loading notices…" />
        ) : loadError ? (
          <ErrorState
            message={loadError}
            onRetry={() => {
              setLoading(true);
              setLoadError(null);
              setFeedRetryKey((value) => value + 1);
            }}
            retryLabel="Reload notices"
            title="Notices unavailable"
          />
        ) : filteredEntries.length === 0 ? (
          <EmptyState
            message={
              feedFilter === 'tower'
                ? 'No notices are targeted to your tower or unit yet.'
                : feedFilter === 'unit'
                  ? 'No notices are targeted to your unit yet.'
                  : 'Your builder has not published a notice for this unit yet.'
            }
            title="No notices"
          />
        ) : (
          filteredEntries.map((entry) => (
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
