import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  fetchServerReports,
  type ServerReport,
} from '../../adapters/reportsApi';
import { useServices } from '../../app/ServicesProvider';

export type ServerReportsState =
  | { kind: 'loading' }
  | { kind: 'loaded'; reports: ServerReport[]; checkedAt: number }
  /** No list at all: never show an old list as if it were what the server holds now. */
  | { kind: 'unreachable'; message: string; triedAt: number };

/** What the server holds right now. Re-read whenever the tab is opened, and on pull to refresh. */
export function useServerReports() {
  const { serverUrl } = useServices();
  const [state, setState] = useState<ServerReportsState>({ kind: 'loading' });
  /** Pull to refresh in progress (drives RefreshControl). */
  const [refreshing, setRefreshing] = useState(false);
  /** Any request in progress: pull, the refresh button, Try again, or opening the tab. */
  const [checking, setChecking] = useState(false);
  const latest = useRef(0);

  const load = useCallback(
    async (pulled: boolean) => {
      const request = ++latest.current;
      if (pulled) setRefreshing(true);
      setChecking(true);
      try {
        const reports = await fetchServerReports(serverUrl());
        if (request === latest.current) {
          setState({ kind: 'loaded', reports, checkedAt: Date.now() });
        }
      } catch (err) {
        if (request === latest.current) {
          setState({
            kind: 'unreachable',
            message:
              err instanceof Error ? err.message : "Can't reach the server",
            triedAt: Date.now(),
          });
        }
      } finally {
        if (request === latest.current) {
          setRefreshing(false);
          setChecking(false);
        }
      }
    },
    [serverUrl],
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  return {
    state,
    refreshing,
    checking,
    refresh: () => load(true),
    retry: () => load(false),
  };
}
