export type ConnectivityState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export function connectionIsUsable(state: ConnectivityState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}
