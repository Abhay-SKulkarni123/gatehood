import { httpsCallable } from '@react-native-firebase/functions';
import type { Functions } from '@react-native-firebase/functions';
import type {
  CreateNoticeData,
  CreateNoticeResult,
  GenerateInviteData,
  GenerateInviteResult,
  MarkNoticeReadData,
  MarkNoticeReadResult,
  NoticeReadStatusData,
  NoticeReadStatusResult,
  RedeemInviteData,
  RedeemInviteResult,
  BuyerImportData,
  BuyerImportResult,
  SetNoticePinnedData,
  SetNoticePinnedResult,
} from '@/types/domain';

async function invoke<Request, Response>(
  functions: Functions,
  name: string,
  data: Request,
): Promise<Response> {
  const callable = httpsCallable<Request, Response>(functions, name);
  const result = await callable(data);
  return result.data;
}

export { describeCallableError } from './errors';

export function callRedeemInvite(
  functions: Functions,
  data: RedeemInviteData,
): Promise<RedeemInviteResult> {
  return invoke<RedeemInviteData, RedeemInviteResult>(functions, 'redeemInvite', data);
}

export function callCreateNotice(
  functions: Functions,
  data: CreateNoticeData,
): Promise<CreateNoticeResult> {
  return invoke<CreateNoticeData, CreateNoticeResult>(functions, 'createNotice', data);
}

export function callSetNoticePinned(
  functions: Functions,
  data: SetNoticePinnedData,
): Promise<SetNoticePinnedResult> {
  return invoke<SetNoticePinnedData, SetNoticePinnedResult>(functions, 'setNoticePinned', data);
}

export function callMarkNoticeRead(
  functions: Functions,
  data: MarkNoticeReadData,
): Promise<MarkNoticeReadResult> {
  return invoke<MarkNoticeReadData, MarkNoticeReadResult>(functions, 'markNoticeRead', data);
}

export function callImportBuyers(
  functions: Functions,
  data: BuyerImportData,
): Promise<BuyerImportResult> {
  return invoke<BuyerImportData, BuyerImportResult>(functions, 'importBuyers', data);
}

export function callGenerateInvite(
  functions: Functions,
  data: GenerateInviteData,
): Promise<GenerateInviteResult> {
  return invoke<GenerateInviteData, GenerateInviteResult>(functions, 'generateInvite', data);
}

export function callGetNoticeReadStatus(
  functions: Functions,
  data: NoticeReadStatusData,
): Promise<NoticeReadStatusResult> {
  return invoke<NoticeReadStatusData, NoticeReadStatusResult>(functions, 'getNoticeReadStatus', data);
}
