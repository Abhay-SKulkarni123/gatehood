import { randomBytes } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type {
  GenerateInviteData,
  GenerateInviteResult,
  RedeemInviteData,
  RedeemInviteResult,
} from '../domain/types';
import { internal, invalidInvite } from '../errors';
import { backfillBuyer } from '../fanout';
import { db, timestampNow } from '../firestore';
import { paths } from '../paths';
import { hashInviteCode } from '../security';
import {
  normalizeInviteCode,
  parseInvite,
  parseMembership,
  parseProject,
  parseTower,
  parseUnit,
  toRecord,
} from '../validation';

function parseDocument<T>(
  snapshot: DocumentSnapshot,
  parser: (value: unknown) => T,
  id: string,
): T {
  if (!snapshot.exists) {
    throw invalidInvite();
  }
  return parser({ ...toRecord(snapshot.data()), id });
}

export async function generateInvite(
  builderUid: string,
  data: GenerateInviteData,
): Promise<GenerateInviteResult> {
  const projectSnapshot = await db.doc(paths.project(data.projectId)).get();
  parseDocument(projectSnapshot, parseProject, data.projectId);
  const towerSnapshot = await db.doc(paths.tower(data.projectId, data.towerId)).get();
  const tower = parseDocument(towerSnapshot, parseTower, data.towerId);
  const unitSnapshot = await db.doc(paths.unit(data.projectId, data.unitId)).get();
  const unit = parseDocument(unitSnapshot, parseUnit, data.unitId);

  if (tower.projectId !== data.projectId || unit.projectId !== data.projectId || unit.towerId !== data.towerId) {
    throw invalidInvite();
  }

  const expiresAt = Timestamp.fromMillis(Date.now() + data.expiresInHours * 60 * 60 * 1000);
  const createdAt = timestampNow();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomBytes(12).toString('hex').toUpperCase();
    const codeHash = hashInviteCode(normalizeInviteCode(code));
    const inviteRef = db.doc(paths.invite(codeHash));

    const committed = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(inviteRef);
      if (snapshot.exists) {
        return false;
      }
      transaction.set(inviteRef, {
        id: codeHash,
        projectId: data.projectId,
        towerId: data.towerId,
        unitId: data.unitId,
        codeHash,
        createdByUid: builderUid,
        createdAt,
        expiresAt,
        usedByUid: null,
        usedAt: null,
      });
      return true;
    });

    if (committed) {
      return {
        code,
        projectId: data.projectId,
        towerId: data.towerId,
        unitId: data.unitId,
        expiresAt: expiresAt.toDate().toISOString(),
      };
    }
  }

  throw internal();
}

export async function redeemInvite(
  uid: string,
  data: RedeemInviteData,
): Promise<RedeemInviteResult> {
  const codeHash = hashInviteCode(data.code);
  const inviteRef = db.doc(paths.invite(codeHash));
  const now = timestampNow();

  const committed = await db.runTransaction(async (transaction) => {
    const inviteSnapshot = await transaction.get(inviteRef);
    if (!inviteSnapshot.exists) {
      throw invalidInvite();
    }

    const invite = parseInvite({ ...toRecord(inviteSnapshot.data()), id: codeHash });
    if (invite.codeHash !== codeHash) {
      throw invalidInvite();
    }
    if (invite.expiresAt.toMillis() <= now.toMillis()) {
      throw invalidInvite();
    }
    if (invite.usedByUid !== null && invite.usedByUid !== uid) {
      throw invalidInvite();
    }
    if (invite.usedAt !== null && invite.usedByUid !== uid) {
      throw invalidInvite();
    }

    const projectSnapshot = await transaction.get(db.doc(paths.project(invite.projectId)));
    const towerSnapshot = await transaction.get(db.doc(paths.tower(invite.projectId, invite.towerId)));
    const unitSnapshot = await transaction.get(db.doc(paths.unit(invite.projectId, invite.unitId)));
    parseDocument(projectSnapshot, parseProject, invite.projectId);
    parseDocument(towerSnapshot, parseTower, invite.towerId);
    const unit = parseDocument(unitSnapshot, parseUnit, invite.unitId);
    if (unit.towerId !== invite.towerId) {
      throw invalidInvite();
    }

    const memberRef = db.doc(paths.member(invite.projectId, uid));
    const memberSnapshot = await transaction.get(memberRef);
    let alreadyMember = false;

    if (memberSnapshot.exists) {
      const membership = parseMembership(toRecord(memberSnapshot.data()));
      if (membership.role !== 'buyer' || membership.projectId !== invite.projectId) {
        throw invalidInvite();
      }
      if (invite.usedByUid !== uid) {
        throw invalidInvite();
      }
      alreadyMember = true;
    } else {
      transaction.set(memberRef, {
        uid,
        projectId: invite.projectId,
        role: 'buyer',
        towerId: invite.towerId,
        unitId: invite.unitId,
        createdByUid: invite.createdByUid,
        createdAt: now,
      });
    }

    if (invite.usedByUid === null) {
      transaction.update(inviteRef, { usedByUid: uid, usedAt: now });
    }

    const result: RedeemInviteResult = {
      projectId: invite.projectId,
      unitId: invite.unitId,
      alreadyMember,
      backfill: { attempted: 0, created: 0, updated: 0, failed: 0, complete: true },
    };
    return { result, towerId: invite.towerId, unitId: invite.unitId };
  });

  const backfill = await backfillBuyer({
    uid,
    projectId: committed.result.projectId,
    role: 'buyer',
    towerId: committed.towerId,
    unitId: committed.unitId,
    createdByUid: '',
    createdAt: timestampNow(),
  });

  return { ...committed.result, backfill };
}
