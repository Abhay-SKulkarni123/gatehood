import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireBuilder, requireBuyer, requireUid } from './auth';
import { FUNCTIONS_REGION, RETRY_SCHEDULE } from './config';
import { asHttpsError } from './errors';
import { retryUnresolvedFailures } from './fanout';
import { acquireRetryLease, releaseRetryLease } from './retryLock';
import {
  createNotice as createNoticeService,
  markNoticeRead as markNoticeReadService,
  setNoticePinned as setNoticePinnedService,
} from './services/notices';
import { redeemInvite as redeemInviteService } from './services/invite';
import {
  parseCreateNotice,
  parseMarkNoticeRead,
  parseRedeemInvite,
  parseSetNoticePinned,
} from './validation';

const callableOptions = {
  region: FUNCTIONS_REGION,
  enforceAppCheck: true,
} as const;

export const redeemInvite = onCall(callableOptions, async (request) => {
  try {
    const uid = requireUid(request);
    const data = parseRedeemInvite(request.data);
    return await redeemInviteService(uid, data);
  } catch (error) {
    throw asHttpsError(error);
  }
});

export const createNotice = onCall(callableOptions, async (request) => {
  try {
    const uid = requireUid(request);
    const data = parseCreateNotice(request.data);
    await requireBuilder(data.projectId, uid);
    return await createNoticeService(uid, data);
  } catch (error) {
    throw asHttpsError(error);
  }
});

export const setNoticePinned = onCall(callableOptions, async (request) => {
  try {
    const uid = requireUid(request);
    const data = parseSetNoticePinned(request.data);
    await requireBuilder(data.projectId, uid);
    return await setNoticePinnedService(data);
  } catch (error) {
    throw asHttpsError(error);
  }
});

export const markNoticeRead = onCall(callableOptions, async (request) => {
  try {
    const uid = requireUid(request);
    const data = parseMarkNoticeRead(request.data);
    await requireBuyer(data.projectId, uid);
    return await markNoticeReadService(uid, data);
  } catch (error) {
    throw asHttpsError(error);
  }
});

export const retryFanoutFailures = onSchedule(
  {
    schedule: RETRY_SCHEDULE,
    timeZone: 'UTC',
    region: FUNCTIONS_REGION,
  },
  async () => {
    const owner = await acquireRetryLease();
    if (!owner) {
      return;
    }

    try {
      await retryUnresolvedFailures();
    } finally {
      await releaseRetryLease(owner);
    }
  },
);
