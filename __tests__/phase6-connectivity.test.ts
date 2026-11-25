import { isTransientCallableError } from '@/lib/functions/errors';
import { connectionIsUsable } from '@/lib/offline/connectivity';

describe('Phase 6 connectivity handling', () => {
  test('unknown initial connectivity is not treated as confirmed connectivity', () => {
    expect(connectionIsUsable({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(connectionIsUsable({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(connectionIsUsable({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(connectionIsUsable({ isConnected: false, isInternetReachable: null })).toBe(false);
  });

  test('only narrow transient callable failures are eligible for offline queue fallback', () => {
    expect(isTransientCallableError({ code: 'functions/unavailable' })).toBe(true);
    expect(isTransientCallableError({ code: 'functions/deadline-exceeded' })).toBe(true);
    expect(isTransientCallableError({ code: 'functions/network' })).toBe(true);
    expect(
      isTransientCallableError(new Error('A network error (such as timeout or unreachable host) occurred.')),
    ).toBe(true);

    expect(isTransientCallableError({ code: 'functions/permission-denied' })).toBe(false);
    expect(isTransientCallableError({ code: 'functions/unauthenticated' })).toBe(false);
    expect(isTransientCallableError({ code: 'functions/invalid-argument' })).toBe(false);
    expect(isTransientCallableError({ code: 'functions/not-found' })).toBe(false);
    expect(isTransientCallableError(new Error('Notice ID is invalid.'))).toBe(false);
    expect(isTransientCallableError(null)).toBe(false);
  });
});
