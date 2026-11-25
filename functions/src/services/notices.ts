import { randomBytes } from 'crypto';
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import type {
  CreateNoticeData,
  CreateNoticeResult,
  MarkNoticeReadData,
  MarkNoticeReadResult,
  NoticeAudience,
  NoticeDoc,
  NoticeReadStatusData,
  NoticeReadStatusRecipient,
  NoticeReadStatusResult,
  SetNoticePinnedData,
  SetNoticePinnedResult,
} from '../domain/types';
import { READ_STATUS_LIMIT, TRANSIENT_ATTEMPTS } from '../config';
import { delay, invalidPayload, isTransientError, noticeNotFound } from '../errors';
import {
  eligibleBuyerUids,
  fanOutToRecipients,
  getNotice,
  isRecipientEligible,
  propagatePinToRecipients,
} from '../fanout';
import { db, incrementBy, timestampNow } from '../firestore';
import { paths } from '../paths';
import {
  parseFeedEntry,
  parseMembership,
  parseNotice,
  parseProject,
  parseTower,
  parseUnit,
  toRecord,
} from '../validation';

function requireSnapshot(snapshot: DocumentSnapshot): void {
  if (!snapshot.exists) {
    throw invalidPayload();
  }
}

function uidFromFeedReference(reference: DocumentReference): string | null {
  const feedCollection = reference.parent;
  const userDocument = feedCollection?.parent;
  if (feedCollection?.id !== 'feed' || !userDocument) {
    return null;
  }
  return userDocument.id.length > 0 ? userDocument.id : null;
}

interface ReadState {
  read: boolean;
  readAt: Date | null;
}

async function runMarkReadTransaction(
  feedRef: DocumentReference,
  noticeRef: DocumentReference,
  data: MarkNoticeReadData,
): Promise<ReadState> {
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await db.runTransaction(async (transaction) => {
        const feedSnapshot = await transaction.get(feedRef);
        if (!feedSnapshot.exists) {
          throw noticeNotFound();
        }

        const feed = parseFeedEntry(toRecord(feedSnapshot.data()));
        if (feed.projectId !== data.projectId || feed.noticeId !== data.noticeId) {
          throw noticeNotFound();
        }

        if (feed.readAt !== null) {
          return { read: false, readAt: feed.readAt.toDate() };
        }

        const now = timestampNow();
        transaction.update(feedRef, { readAt: now, updatedAt: now });
        transaction.update(noticeRef, { readCount: incrementBy(1), updatedAt: now });
        return { read: true, readAt: now.toDate() };
      });
    } catch (error) {
      if (attempt === TRANSIENT_ATTEMPTS || !isTransientError(error)) {
        throw error;
      }
      await delay(attempt * 50);
    }
  }

  throw new Error('Read transaction retry exhausted');
}

async function validateAudience(projectId: string, audience: NoticeAudience): Promise<void> {
  const projectSnapshot = await db.doc(paths.project(projectId)).get();
  requireSnapshot(projectSnapshot);
  const project = parseProject(toRecord(projectSnapshot.data()));
  if (project.id !== projectId) {
    throw invalidPayload();
  }

  if (audience.type === 'project') {
    return;
  }

  if (audience.type === 'tower') {
    await Promise.all(
      audience.towerIds.map(async (towerId) => {
        const snapshot = await db.doc(paths.tower(projectId, towerId)).get();
        requireSnapshot(snapshot);
        const tower = parseTower(toRecord(snapshot.data()));
        if (tower.projectId !== projectId) {
          throw invalidPayload();
        }
      }),
    );
    return;
  }

  await Promise.all(
    audience.unitIds.map(async (unitId) => {
      const snapshot = await db.doc(paths.unit(projectId, unitId)).get();
      requireSnapshot(snapshot);
      const unit = parseUnit(toRecord(snapshot.data()));
      if (unit.projectId !== projectId) {
        throw invalidPayload();
      }
      const towerSnapshot = await db.doc(paths.tower(projectId, unit.towerId)).get();
      requireSnapshot(towerSnapshot);
      const tower = parseTower(toRecord(towerSnapshot.data()));
      if (tower.projectId !== projectId || tower.id !== unit.towerId) {
        throw invalidPayload();
      }
    }),
  );
}

function audienceFields(audience: NoticeAudience): Pick<
  NoticeDoc,
  'audienceType' | 'audienceTowerIds' | 'audienceUnitIds'
> {
  if (audience.type === 'project') {
    return { audienceType: 'project', audienceTowerIds: [], audienceUnitIds: [] };
  }
  if (audience.type === 'tower') {
    return {
      audienceType: 'tower',
      audienceTowerIds: audience.towerIds,
      audienceUnitIds: [],
    };
  }
  return {
    audienceType: 'unit',
    audienceTowerIds: [],
    audienceUnitIds: audience.unitIds,
  };
}

export async function createNotice(
  builderUid: string,
  data: CreateNoticeData,
): Promise<CreateNoticeResult> {
  await validateAudience(data.projectId, data.audience);

  const noticeId = randomBytes(12).toString('hex');
  const now = timestampNow();
  const noticeData = {
    ...audienceFields(data.audience),
    id: noticeId,
    projectId: data.projectId,
    title: data.title,
    body: data.body,
    pinned: false,
    createdByUid: builderUid,
    createdAt: now,
    updatedAt: now,
    audienceCount: 0,
    readCount: 0,
    fanoutStatus: 'pending' as const,
    fanoutFailedCount: 0,
    pinStatus: 'complete' as const,
    pinFailedCount: 0,
  };

  await db.doc(paths.notice(data.projectId, noticeId)).set(noticeData);
  const notice = parseNotice(noticeData);
  const fanout = await fanOutToRecipients(notice, await eligibleBuyerUids(notice), 'notice');
  const updated = await getNotice(data.projectId, noticeId);

  return {
    noticeId,
    audienceCount: updated.audienceCount,
    fanoutStatus: updated.fanoutStatus,
    fanoutFailedCount: updated.fanoutFailedCount,
    fanout,
  };
}

export async function setNoticePinned(data: SetNoticePinnedData): Promise<SetNoticePinnedResult> {
  await getNotice(data.projectId, data.noticeId);
  await db.doc(paths.notice(data.projectId, data.noticeId)).update({
    pinned: data.pinned,
    updatedAt: timestampNow(),
  });

  const updated = await getNotice(data.projectId, data.noticeId);
  const feedSnapshot = await db
    .collectionGroup('feed')
    .where('noticeId', '==', data.noticeId)
    .where('projectId', '==', data.projectId)
    .get();
  const recipientUids = feedSnapshot.docs
    .map((feedDocument) => uidFromFeedReference(feedDocument.ref))
    .filter((uid): uid is string => uid !== null);

  const propagation = await propagatePinToRecipients(updated, recipientUids);
  const final = await getNotice(data.projectId, data.noticeId);

  return {
    noticeId: data.noticeId,
    pinned: final.pinned,
    pinStatus: final.pinStatus,
    pinFailedCount: final.pinFailedCount,
    propagation,
  };
}

export async function markNoticeRead(
  uid: string,
  data: MarkNoticeReadData,
): Promise<MarkNoticeReadResult> {
  const feedRef = db.doc(paths.feed(uid, data.noticeId));
  const noticeRef = db.doc(paths.notice(data.projectId, data.noticeId));
  const readState = await runMarkReadTransaction(feedRef, noticeRef, data);

  const notice = await getNotice(data.projectId, data.noticeId);
  return {
    noticeId: data.noticeId,
    read: readState.read,
    readAt: readState.readAt === null ? null : readState.readAt.toISOString(),
    readCount: notice.readCount,
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function getNoticeReadStatus(
  data: NoticeReadStatusData,
): Promise<NoticeReadStatusResult> {
  const notice = await getNotice(data.projectId, data.noticeId);
  const membersSnapshot = await db
    .collection(paths.members(data.projectId))
    .where('role', '==', 'buyer')
    .limit(READ_STATUS_LIMIT)
    .get();

  const eligible = membersSnapshot.docs.flatMap((document) => {
    try {
      const membership = parseMembership(toRecord(document.data()));
      return membership.projectId === data.projectId && isRecipientEligible(membership, notice)
        ? [membership]
        : [];
    } catch {
      return [];
    }
  });

  const feedRefs = eligible.map((membership) => db.doc(paths.feed(membership.uid, notice.id)));
  const feedSnapshots = new Map<string, DocumentSnapshot>();
  for (const chunk of chunks(feedRefs, 100)) {
    const loaded = await db.getAll(...chunk);
    for (const snapshot of loaded) {
      feedSnapshots.set(snapshot.ref.path, snapshot);
    }
  }

  const recipients: NoticeReadStatusRecipient[] = eligible.map((membership) => {
    const snapshot = feedSnapshots.get(paths.feed(membership.uid, notice.id));
    let delivered = false;
    let read = false;
    let readAt: string | null = null;

    if (snapshot?.exists) {
      try {
        const feed = parseFeedEntry(toRecord(snapshot.data()));
        if (feed.projectId === data.projectId && feed.noticeId === notice.id) {
          delivered = true;
          read = feed.readAt !== null;
          readAt = feed.readAt === null ? null : feed.readAt.toDate().toISOString();
        }
      } catch {
        delivered = false;
        read = false;
        readAt = null;
      }
    }

    return {
      uid: membership.uid,
      towerId: membership.towerId,
      unitId: membership.unitId,
      delivered,
      read,
      readAt,
    };
  });

  return {
    noticeId: notice.id,
    audienceCount: notice.audienceCount,
    readCount: notice.readCount,
    deliveredCount: recipients.filter((recipient) => recipient.delivered).length,
    unreadCount: recipients.filter((recipient) => !recipient.read).length,
    recipientCount: recipients.length,
    truncated: membersSnapshot.docs.length === READ_STATUS_LIMIT,
    recipients,
  };
}
