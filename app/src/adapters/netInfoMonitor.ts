import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { NetworkMonitor } from '../core/ports';

/**
 * Uses `isConnected` (there is a network link), not `isInternetReachable`:
 * the latter pings a public site, so on a LAN-only test network it reports
 * "offline" even though our server is right there. A link that turns out not
 * to reach our server just fails like any other request and is retried.
 */
function reachable(state: NetInfoState): boolean | undefined {
  return state.isConnected ?? undefined;
}

export class NetInfoMonitor implements NetworkMonitor {
  private current: boolean | undefined;

  constructor() {
    // Keep a last-known value so isReachable() is synchronous.
    NetInfo.addEventListener(state => {
      this.current = reachable(state);
    });
  }

  isReachable(): boolean | undefined {
    return this.current;
  }

  subscribe(listener: (reachable: boolean) => void): () => void {
    let last = this.current;
    return NetInfo.addEventListener(state => {
      const next = reachable(state);
      if (next === undefined || next === last) return;
      last = next;
      listener(next);
    });
  }
}
