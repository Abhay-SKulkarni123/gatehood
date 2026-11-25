export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

export type Role = 'builder' | 'buyer';

export type AudienceType = 'project' | 'tower' | 'unit';

export type FanoutStatus = 'pending' | 'processing' | 'complete' | 'partial' | 'failed';

export type PinStatus = 'complete' | 'partial' | 'failed';

export type FailureKind = 'notice' | 'backfill' | 'pin';

export type NoticeAudience =
  | { type: 'project' }
  | { type: 'tower'; towerIds: string[] }
  | { type: 'unit'; unitIds: string[] };

export interface UserDoc {
  uid: string;
  displayName: string | null;
  phone: string | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface ProjectDoc {
  id: string;
  name: string;
  createdByUid: string;
  createdAt: FirestoreTimestamp;
}

export interface MembershipDoc {
  uid: string;
  projectId: string;
  role: Role;
  towerId: string | null;
  unitId: string | null;
  createdByUid: string;
  createdAt: FirestoreTimestamp;
}

export interface TowerDoc {
  id: string;
  projectId: string;
  name: string;
  createdAt: FirestoreTimestamp;
}

export interface UnitDoc {
  id: string;
  projectId: string;
  towerId: string;
  label: string;
  createdAt: FirestoreTimestamp;
}

export interface InviteDoc {
  id: string;
  projectId: string;
  towerId: string;
  unitId: string;
  codeHash: string;
  createdByUid: string;
  createdAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
  usedByUid: string | null;
  usedAt: FirestoreTimestamp | null;
}

export interface NoticeDoc {
  id: string;
  projectId: string;
  title: string;
  body: string;
  audienceType: AudienceType;
  audienceTowerIds: string[];
  audienceUnitIds: string[];
  pinned: boolean;
  createdByUid: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  audienceCount: number;
  readCount: number;
  fanoutStatus: FanoutStatus;
  fanoutFailedCount: number;
  pinStatus: PinStatus;
  pinFailedCount: number;
}

export interface FeedEntryDoc {
  uid: string;
  noticeId: string;
  projectId: string;
  title: string;
  body: string;
  pinned: boolean;
  deliveredAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  readAt: FirestoreTimestamp | null;
}

export interface FanoutFailureDoc {
  id: string;
  noticeId: string;
  projectId: string;
  uid: string;
  kind: FailureKind;
  reason: string;
  resolved: boolean;
  retryable: boolean;
  attempts: number;
  lastAttemptAt: FirestoreTimestamp | null;
  updatedAt: FirestoreTimestamp;
}

export interface RetryRunResult {
  notices: number;
  failures: number;
  resolved: number;
  failed: number;
  terminal: number;
}

export interface FanoutStats {
  attempted: number;
  created: number;
  updated: number;
  failed: number;
  complete: boolean;
}

export interface UnitImportData {
  projectId: string;
  csv: string;
  dryRun: boolean;
}

export interface UnitImportRow {
  row: number;
  towerId: string;
  unitId: string;
  label: string;
  status: 'create' | 'unchanged' | 'error';
  message: string | null;
}

export interface UnitImportResult {
  dryRun: boolean;
  rows: UnitImportRow[];
  created: number;
  unchanged: number;
  failed: number;
  complete: boolean;
}

export interface GenerateInviteData {
  projectId: string;
  towerId: string;
  unitId: string;
  expiresInHours: number;
}

export interface GenerateInviteResult {
  code: string;
  projectId: string;
  towerId: string;
  unitId: string;
  expiresAt: string;
}

export interface NoticeReadStatusData {
  projectId: string;
  noticeId: string;
}

export interface NoticeReadStatusRecipient {
  uid: string;
  towerId: string | null;
  unitId: string | null;
  delivered: boolean;
  read: boolean;
  readAt: string | null;
}

export interface NoticeReadStatusResult {
  noticeId: string;
  audienceCount: number;
  readCount: number;
  deliveredCount: number;
  unreadCount: number;
  recipientCount: number;
  truncated: boolean;
  recipients: NoticeReadStatusRecipient[];
}

export interface RedeemInviteData {
  code: string;
}

export interface RedeemInviteResult {
  projectId: string;
  unitId: string;
  alreadyMember: boolean;
  backfill: FanoutStats;
}

export interface CreateNoticeData {
  projectId: string;
  title: string;
  body: string;
  audience: NoticeAudience;
}

export interface CreateNoticeResult {
  noticeId: string;
  audienceCount: number;
  fanoutStatus: FanoutStatus;
  fanoutFailedCount: number;
  fanout: FanoutStats;
}

export interface SetNoticePinnedData {
  projectId: string;
  noticeId: string;
  pinned: boolean;
}

export interface SetNoticePinnedResult {
  noticeId: string;
  pinned: boolean;
  pinStatus: PinStatus;
  pinFailedCount: number;
  propagation: FanoutStats;
}

export interface MarkNoticeReadData {
  projectId: string;
  noticeId: string;
}

export interface MarkNoticeReadResult {
  noticeId: string;
  read: boolean;
  readAt: string | null;
  readCount: number;
}
