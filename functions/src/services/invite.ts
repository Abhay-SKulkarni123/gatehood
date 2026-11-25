import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { RedeemInviteData, RedeemInviteResult } from '../domain/types';
import { invalidInvite } from '../errors';
import { backfillBuyer } from '../fanout';
import { db, timestampNow } from '../firestore';
import { paths } from '../paths';
import { hashInviteCode } from '../security';
import {
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
