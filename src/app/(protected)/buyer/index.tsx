import { useEffect, useMemo, useReducer, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingIndicator } from '@/components/loading-indicator';
import { PrimaryButton } from '@/components/primary-button';
import { ProgressTrack } from '@/components/progress-track';
import { Screen } from '@/components/screen';
import { SectionCard } from '@/components/section-card';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceHeader } from '@/components/workspace-header';
import { getClientConfig } from '@/config/env';
import { createFeedListenerController, loadBuyerProject } from '@/lib/data/buyer';
import { createFeedState, feedReducer, feedScopeKey } from '@/lib/data/feed-state';
import { describeConstructionProgress, describePossessionDate, loadBuyerUnit } from '@/lib/data/units';
import { filterBuyerFeed, type BuyerFeedFilter } from '@/lib/data/sort';
import {
  callMarkNoticeRead,
  describeCallableError,
  isTransientCallableError,
} from '@/lib/functions';
import { getFirebaseServices } from '@/lib/firebase';
import { describeNoticeAudienceSummary } from '@/lib/ui/notices';
import { useAuth } from '@/providers/auth-provider';
import { useMembership } from '@/providers/membership-provider';
import { useOfflineSync } from '@/providers/offline-sync-provider';
import type { FirestoreTimestamp, ProjectDoc, UnitDoc } from '@/types/domain';
import { colors, radius, spacing, typography } from '@/theme';

function formatTimestamp(value: FirestoreTimestamp): string {
  return value.toDate().toLocaleString();
}

export default function BuyerHomeScreen() {
  const { user, logout, actionPending, actionError } = useAuth();
  const { state: membership } = useMembership();
  const { isOnline, pendingNoticeIds, syncError, queueRead, removePendingRead } = useOfflineSync();
  const { constructionProjectId } = getClientConfig();
  const uid = user?.uid ?? null;
  const scopeKey = feedScopeKey(uid ?? '', constructionProjectId);

  const [feedState, dispatchFeed] = useReducer(feedReducer, scopeKey, createFeedState);
  if (feedState.scopeKey !== scopeKey) {
    dispatchFeed({ type: 'scopeChanged', scopeKey });
  }
  const feed = feedState.scopeKey === scopeKey ? feedState : createFeedState(scopeKey);
  const [feedFilter, setFeedFilter] = useState<BuyerFeedFilter>('all');
  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectRetryKey, setProjectRetryKey] = useState(0);
  const [unit, setUnit] = useState<UnitDoc | null>(null);
  const [unitLoading, setUnitLoading] = useState(true);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitRetryKey, setUnitRetryKey] = useState(0);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const membershipRecord = membership.status === 'ready' ? membership.membership : null;
  const pendingSet = useMemo(() => new Set(pendingNoticeIds), [pendingNoticeIds]);
  const displayedError = error ?? syncError;

  useEffect(() => {
    if (!uid) {
      return;
    }
    try {
      const controller = createFeedListenerController(
        getFirebaseServices().firestore,
        uid,
        constructionProjectId,
        (snapshot) => dispatchFeed({ type: 'snapshot', scopeKey, snapshot }),
        (feedError) =>
          dispatchFeed({
            type: 'error',
            scopeKey,
            message: describeCallableError(feedError),
          }),
      );
      controller.start(feed.limit);
      return () => controller.stop();
    } catch (feedError) {
      const message = describeCallableError(feedError);
      void Promise.resolve().then(() => dispatchFeed({ type: 'error', scopeKey, message }));
      return undefined;
    }
  }, [constructionProjectId, uid, scopeKey, feed.limit, feed.retryKey]);

  useEffect(() => {
    if (!membershipRecord) {
      return;
    }

    let active = true;
    const run = async () => {
      setProjectLoading(true);
      setProjectError(null);
      setProject(null);
      try {
        const { firestore } = getFirebaseServices();
        const data = await loadBuyerProject(firestore, membershipRecord);
        if (active) {
          setProject(data);
        }
      } catch (projectLoadError) {
        if (active) {
          setProjectError(describeCallableError(projectLoadError));
        }
      } finally {
        if (active) {
          setProjectLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [membershipRecord, projectRetryKey]);

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
  }, [membershipRecord, unitRetryKey]);

  const filteredEntries = useMemo(
    () => filterBuyerFeed(feed.entries, membershipRecord, feedFilter),
    [feed.entries, membershipRecord, feedFilter],
  );

  const handleMarkRead = async (noticeId: string) => {
    setBusyNoticeId(noticeId);
    setError(null);
    try {
      if (!isOnline) {
        await queueRead(noticeId);
        return;
      }
      await callMarkNoticeRead(getFirebaseServices().functions, {
        projectId: constructionProjectId,
        noticeId,
      });
      await removePendingRead(noticeId);
    } catch (readError) {
      if (!isTransientCallableError(readError)) {
        setError(describeCallableError(readError));
        return;
      }
      try {
        await queueRead(noticeId);
      } catch (queueError) {
        setError(describeCallableError(queueError));
      }
    } finally {
      setBusyNoticeId(null);
    }
  };

  return (
    <Screen>
      <WorkspaceHeader
        accountLabel={`Signed in as ${user?.email ?? user?.uid ?? 'a buyer'}`}
        eyebrow="BUYER WORKSPACE"
        onSignOut={() => void logout()}
        signOutError={actionError}
        signOutPending={actionPending}
        subtitle="Follow construction progress and builder notices for your home through possession."
        title="Project updates"
      />

      {displayedError ? (
        <ErrorState message={displayedError} title={error ? 'Action failed' : 'Read sync pending'} />
      ) : null}

      {membershipRecord ? (
        <SectionCard
          helper="Your builder publishes these details for your assigned unit."
          title="My unit"
        >
          {projectLoading ? (
            <LoadingIndicator label="Loading project details…" />
          ) : projectError ? (
            <ErrorState
              message={projectError}
              onRetry={() => {
                setProjectError(null);
                setProjectLoading(true);
                setProjectRetryKey((value) => value + 1);
              }}
              retryLabel="Retry project details"
              retryPending={projectLoading}
              title="Project details unavailable"
            />
          ) : (
            <Text style={styles.detail}>Project: {project?.name ?? 'Not available'}</Text>
          )}
          <Text style={styles.detail}>Tower: {membershipRecord.towerId ?? 'Not assigned'}</Text>
          <Text style={styles.detail}>Unit: {membershipRecord.unitId ?? 'Not assigned'}</Text>
          {unitLoading ? (
            <LoadingIndicator label="Loading unit details…" />
          ) : unitError ? (
            <ErrorState
              message={unitError}
              onRetry={() => {
                setUnitError(null);
                setUnitLoading(true);
                setUnitRetryKey((value) => value + 1);
              }}
              retryLabel="Retry unit details"
              retryPending={unitLoading}
              title="Unit details unavailable"
            />
          ) : (
            <>
              <Text style={styles.detail}>
                Configuration: {unit?.configuration ?? 'Not available'}
              </Text>
              <Text style={styles.detail}>
                Construction: {describeConstructionProgress(unit?.constructionProgress)}
              </Text>
              {typeof unit?.constructionProgress === 'number' ? (
                <ProgressTrack value={unit.constructionProgress} />
              ) : null}
              <Text style={styles.detail}>{describePossessionDate(unit?.possessionDate)}</Text>
              {unit === null ? (
                <Text style={styles.detail}>Your builder has not added these details yet.</Text>
              ) : null}
            </>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        helper="Pinned notices appear first, followed by the newest updates."
        title="Notices"
      >
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
        {feed.fromCache || !isOnline ? (
          <View style={styles.statusRow}>
            <StatusBadge label={feed.fromCache ? 'Cached' : 'Offline'} tone="muted" />
            <Text accessibilityRole="status" style={styles.status}>
              {feed.fromCache
                ? 'Showing cached notices. Live updates will resume when available.'
                : 'Read actions will sync when the connection returns.'}
            </Text>
          </View>
        ) : null}
        {feed.loading && feed.entries.length === 0 ? (
          <LoadingIndicator label="Loading notices…" />
        ) : null}
        {feed.loading && !feed.loadingMore && feed.entries.length > 0 ? (
          <LoadingIndicator label="Refreshing notices…" />
        ) : null}
        {feed.error ? (
          <ErrorState
            message={feed.error}
            onRetry={() => dispatchFeed({ type: 'retry' })}
            retryLabel="Reload notices"
            retryPending={feed.loading}
            title="Notices unavailable"
          />
        ) : null}
        {!feed.loading && filteredEntries.length === 0 ? (
          <EmptyState
            message={
              feedFilter === 'tower'
                ? 'No project-wide or matching tower notices have been delivered.'
                : feedFilter === 'unit'
                  ? 'No project-wide, matching tower, or matching unit notices have been delivered.'
                  : 'No notices have been delivered to your feed yet.'
            }
            title="No notices"
          />
        ) : null}
        {filteredEntries.map((entry) => (
          <View key={entry.noticeId} style={styles.notice}>
            <View style={styles.noticeHeader}>
              <Text style={styles.noticeTitle}>{entry.title}</Text>
              {entry.pinned ? <StatusBadge label="Pinned" tone="accent" /> : null}
            </View>
            <Text style={styles.body}>{entry.body}</Text>
            <Text style={styles.detail}>Audience: {describeNoticeAudienceSummary(entry)}</Text>
            <Text style={styles.detail}>Delivered {formatTimestamp(entry.deliveredAt)}</Text>
            <View style={styles.statusRow}>
              {entry.readAt !== null ? (
                <StatusBadge label="Read" tone="accent" />
              ) : pendingSet.has(entry.noticeId) ? (
                <StatusBadge label="Pending sync" tone="muted" />
              ) : (
                <StatusBadge label="Unread" tone="muted" />
              )}
              {entry.readAt !== null ? (
                <Text style={styles.detail}>Read {formatTimestamp(entry.readAt)}</Text>
              ) : null}
            </View>
            {entry.readAt === null && !pendingSet.has(entry.noticeId) ? (
              <PrimaryButton
                label="Mark as read"
                loading={busyNoticeId === entry.noticeId}
                onPress={() => void handleMarkRead(entry.noticeId)}
              />
            ) : null}
          </View>
        ))}
        {feed.loadingMore ? <LoadingIndicator label="Loading more notices…" /> : null}
        {!feed.loadingMore && feed.hasMore && feed.entries.length > 0 ? (
          <PrimaryButton
            label="Load more"
            onPress={() => dispatchFeed({ type: 'loadMore' })}
          />
        ) : null}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  noticeTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  status: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
});
