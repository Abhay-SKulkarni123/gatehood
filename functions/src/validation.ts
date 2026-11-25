import { z } from 'zod';
import type {
  BuyerContactDoc,
  BuyerImportData,
  CreateNoticeData,
  FanoutFailureDoc,
  FeedEntryDoc,
  FirestoreTimestamp,
  GenerateInviteData,
  InviteDoc,
  InviteSlotDoc,
  MarkNoticeReadData,
  MembershipDoc,
  NoticeDoc,
  NoticeReadStatusData,
  ProjectDoc,
  RedeemInviteData,
  SetNoticePinnedData,
  TowerDoc,
  UnitDoc,
  UpdateUnitInfoData,
} from './domain/types';
import { invalidPayload } from './errors';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVITE_CODE_PATTERN = /^[A-Z0-9]{12,64}$/;
const PHONE_INPUT_PATTERN = /^\+?[0-9\s().-]{7,24}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const idSchema = z.string().trim().min(1).max(100).regex(SLUG_PATTERN);
const slugSchema = z.string().trim().min(1).max(100).regex(SLUG_PATTERN);
const nullableIdSchema = idSchema.nullable();

const timestampSchema = z.custom<FirestoreTimestamp>((value) => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<FirestoreTimestamp>;
  return (
    typeof candidate.seconds === 'number' &&
    typeof candidate.nanoseconds === 'number' &&
    typeof candidate.toDate === 'function' &&
    typeof candidate.toMillis === 'function'
  );
});

const nullableTimestampSchema = timestampSchema.nullable();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export function normalizeInviteCode(value: string): string {
  return value.trim().replace(/[\s-]/g, '').toUpperCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

const inviteCodeSchema = z
  .string()
  .trim()
  .min(12)
  .max(128)
  .transform(normalizeInviteCode)
  .pipe(z.string().regex(INVITE_CODE_PATTERN));

const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_INPUT_PATTERN)
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+?[0-9]{7,15}$/));

const noticeAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('project') }).strict(),
  z
    .object({
      type: z.literal('tower'),
      towerIds: z.array(idSchema).min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('unit'),
      unitIds: z.array(idSchema).min(1).max(200),
    })
    .strict(),
]);

const POSSESSION_DATE_ERROR = 'Possession date must be a valid YYYY-MM-DD date.';

const possessionDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_PATTERN, POSSESSION_DATE_ERROR)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, POSSESSION_DATE_ERROR);

const redeemInviteSchema = z
  .object({
    code: inviteCodeSchema,
    expectedProjectId: slugSchema.optional(),
  })
  .strict();

const createNoticeSchema = z
  .object({
    projectId: slugSchema,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(2000),
    audience: noticeAudienceSchema,
  })
  .strict();

const setNoticePinnedSchema = z
  .object({
    projectId: slugSchema,
    noticeId: slugSchema,
    pinned: z.boolean(),
  })
  .strict();

const markNoticeReadSchema = z
  .object({
    projectId: slugSchema,
    noticeId: slugSchema,
  })
  .strict();

const updateUnitInfoSchema = z
  .object({
    projectId: slugSchema,
    unitId: idSchema,
    configuration: z.string().trim().min(1).max(120),
    constructionProgress: z.number().int().min(0).max(100),
    possessionDate: possessionDateSchema,
  })
  .strict();

const buyerImportSchema = z
  .object({
    projectId: slugSchema,
    csv: z.string().trim().min(1).max(200000),
    dryRun: z.boolean().default(false),
  })
  .strict();

const generateInviteSchema = z
  .object({
    projectId: slugSchema,
    towerId: idSchema,
    unitId: idSchema,
    expiresInHours: z.number().int().min(1).max(720).default(168),
    regenerate: z.boolean().default(false),
  })
  .strict();

const noticeReadStatusSchema = z
  .object({
    projectId: slugSchema,
    noticeId: slugSchema,
  })
  .strict();

const projectDocSchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1).max(120),
    createdByUid: z.string().min(1).max(128),
    createdAt: timestampSchema,
  })
  .strict();

const membershipDocSchema = z
  .object({
    uid: z.string().min(1).max(128),
    projectId: slugSchema,
    role: z.enum(['builder', 'buyer']),
    towerId: nullableIdSchema,
    unitId: nullableIdSchema,
    createdByUid: z.string().min(1).max(128),
    createdAt: timestampSchema,
  })
  .strict();

const towerDocSchema = z
  .object({
    id: idSchema,
    projectId: slugSchema,
    name: z.string().min(1).max(120),
    createdAt: timestampSchema,
  })
  .strict();

const unitDocSchema = z
  .object({
    id: idSchema,
    projectId: slugSchema,
    towerId: idSchema,
    label: z.string().min(1).max(120),
    createdAt: timestampSchema,
    configuration: z.string().min(1).max(120).nullable().optional(),
    constructionProgress: z.number().int().min(0).max(100).nullable().optional(),
    possessionDate: timestampSchema.nullable().optional(),
    updatedAt: timestampSchema.optional(),
    updatedByUid: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();

const buyerContactDocSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    projectId: slugSchema,
    towerId: idSchema,
    unitId: idSchema,
    name: z.string().min(1).max(120),
    phone: z.string().regex(/^\+?[0-9]{7,15}$/),
    importedByUid: z.string().min(1).max(128),
    importedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const inviteDocSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    projectId: slugSchema,
    towerId: idSchema,
    unitId: idSchema,
    codeHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdByUid: z.string().min(1).max(128),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    usedByUid: z.string().min(1).max(128).nullable(),
    usedAt: nullableTimestampSchema,
    revokedAt: nullableTimestampSchema.default(null),
  })
  .strict();

const inviteSlotDocSchema = z
  .object({
    id: idSchema,
    projectId: slugSchema,
    towerId: idSchema,
    unitId: idSchema,
    codeHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdByUid: z.string().min(1).max(128),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    usedByUid: z.string().min(1).max(128).nullable(),
    usedAt: nullableTimestampSchema,
    revokedAt: nullableTimestampSchema.default(null),
  })
  .strict();

const noticeDocSchema = z
  .object({
    id: idSchema,
    projectId: slugSchema,
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(2000),
    audienceType: z.enum(['project', 'tower', 'unit']),
    audienceTowerIds: z.array(idSchema).max(200),
    audienceUnitIds: z.array(idSchema).max(200),
    pinned: z.boolean(),
    createdByUid: z.string().min(1).max(128),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    audienceCount: nonNegativeIntegerSchema,
    readCount: nonNegativeIntegerSchema,
    fanoutStatus: z.enum(['pending', 'processing', 'complete', 'partial', 'failed']),
    fanoutFailedCount: nonNegativeIntegerSchema,
    pinStatus: z.enum(['complete', 'partial', 'failed']),
    pinFailedCount: nonNegativeIntegerSchema,
  })
  .strict();

const feedEntryDocSchema = z
  .object({
    uid: z.string().min(1).max(128),
    noticeId: idSchema,
    projectId: slugSchema,
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(2000),
    pinned: z.boolean(),
    deliveredAt: timestampSchema,
    updatedAt: timestampSchema,
    readAt: nullableTimestampSchema,
    audienceType: z.enum(['project', 'tower', 'unit']).optional(),
    audienceTowerIds: z.array(idSchema).max(200).optional(),
    audienceUnitIds: z.array(idSchema).max(200).optional(),
  })
  .strict();

const failureDocSchema = z
  .object({
    id: z.string().min(1).max(256),
    noticeId: idSchema,
    projectId: slugSchema,
    uid: z.string().min(1).max(128),
    kind: z.enum(['notice', 'backfill', 'pin']),
    reason: z.string().max(200),
    resolved: z.boolean(),
    retryable: z.boolean().default(true),
    attempts: nonNegativeIntegerSchema.default(0),
    lastAttemptAt: nullableTimestampSchema.default(null),
    updatedAt: timestampSchema,
  })
  .strict();

export function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid Firestore document');
  }
  return value as Record<string, unknown>;
}

export function parseRedeemInvite(value: unknown): RedeemInviteData {
  const result = redeemInviteSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseCreateNotice(value: unknown): CreateNoticeData {
  const result = createNoticeSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseSetNoticePinned(value: unknown): SetNoticePinnedData {
  const result = setNoticePinnedSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseMarkNoticeRead(value: unknown): MarkNoticeReadData {
  const result = markNoticeReadSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseBuyerImport(value: unknown): BuyerImportData {
  const result = buyerImportSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseUpdateUnitInfo(value: unknown): UpdateUnitInfoData {
  const result = updateUnitInfoSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseGenerateInvite(value: unknown): GenerateInviteData {
  const result = generateInviteSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function parseNoticeReadStatus(value: unknown): NoticeReadStatusData {
  const result = noticeReadStatusSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}

export function isValidId(value: string): boolean {
  return idSchema.safeParse(value).success;
}

export function parseProject(value: unknown): ProjectDoc {
  return projectDocSchema.parse(value);
}

export function parseMembership(value: unknown): MembershipDoc {
  return membershipDocSchema.parse(value);
}

export function parseTower(value: unknown): TowerDoc {
  return towerDocSchema.parse(value);
}

export function parseUnit(value: unknown): UnitDoc {
  return unitDocSchema.parse(value);
}

export function parseBuyerContact(value: unknown): BuyerContactDoc {
  return buyerContactDocSchema.parse(value);
}

export function parseInvite(value: unknown): InviteDoc {
  return inviteDocSchema.parse(value);
}

export function parseInviteSlot(value: unknown): InviteSlotDoc {
  return inviteSlotDocSchema.parse(value);
}

export function parseNotice(value: unknown): NoticeDoc {
  return noticeDocSchema.parse(value);
}

export function parseFeedEntry(value: unknown): FeedEntryDoc {
  return feedEntryDocSchema.parse(value);
}

export function parseFailure(value: unknown): FanoutFailureDoc {
  return failureDocSchema.parse(value);
}

export function parsePhone(value: string): string {
  const result = phoneSchema.safeParse(value);
  if (!result.success) {
    throw invalidPayload();
  }
  return result.data;
}
