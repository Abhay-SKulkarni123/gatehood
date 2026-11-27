import type { FeedEntryDoc } from '@/types/domain';

export const FEED_PAGE_SIZE = 15;

export type BuyerFeedSnapshot = {
  entries: FeedEntryDoc[];
  hasMore: boolean;
  fromCache: boolean;
};

export type BuyerFeedState = {
  scopeKey: string;
  limit: number;
  retryKey: number;
  entries: FeedEntryDoc[];
  hasMore: boolean;
  fromCache: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

export type BuyerFeedAction =
  | { type: 'scopeChanged'; scopeKey: string }
  | { type: 'retry' }
  | { type: 'loadMore' }
  | { type: 'snapshot'; scopeKey: string; snapshot: BuyerFeedSnapshot }
  | { type: 'error'; scopeKey: string; message: string };

export function feedScopeKey(uid: string, projectId: string): string {
  return `${uid}\u0000${projectId}`;
}

export function nextFeedLimit(limit: number): number {
  return limit + FEED_PAGE_SIZE;
}

export function shouldShowEmptyFeed(state: BuyerFeedState, filteredCount: number): boolean {
  return !state.loading && !state.error && !state.hasMore && filteredCount === 0;
}

export function createFeedState(scopeKey: string): BuyerFeedState {
  return {
    scopeKey,
    limit: FEED_PAGE_SIZE,
    retryKey: 0,
    entries: [],
    hasMore: true,
    fromCache: false,
    loading: true,
    loadingMore: false,
    error: null,
  };
}

export function feedReducer(state: BuyerFeedState, action: BuyerFeedAction): BuyerFeedState {
  if (action.type === 'scopeChanged') {
    return createFeedState(action.scopeKey);
  }
  if (action.type === 'retry') {
    return {
      ...state,
      retryKey: state.retryKey + 1,
      loading: true,
      error: null,
    };
  }
  if (action.type === 'loadMore') {
    if (state.loadingMore || !state.hasMore) {
      return state;
    }
    return {
      ...state,
      limit: nextFeedLimit(state.limit),
      loadingMore: true,
      error: null,
    };
  }
  if (action.scopeKey !== state.scopeKey) {
    return state;
  }
  if (action.type === 'snapshot') {
    return {
      ...state,
      entries: action.snapshot.entries,
      hasMore: action.snapshot.hasMore,
      fromCache: action.snapshot.fromCache,
      loading: false,
      loadingMore: false,
      error: null,
    };
  }
  return {
    ...state,
    error: action.message,
    loading: false,
    loadingMore: false,
  };
}
