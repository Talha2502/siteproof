import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { OutboxSnapshot } from '../core/engine';
import { Button } from '../ui/Button';
import { theme } from '../ui/theme';
import { createServices, type Services } from './services';

const ServicesContext = createContext<Services | undefined>(undefined);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices() outside <ServicesProvider>');
  return services;
}

/** The engine's live state. Re-renders on every change. */
export function useOutbox(): OutboxSnapshot {
  const { engine } = useServices();
  return useSyncExternalStore(
    useCallback(listener => engine.subscribe(listener), [engine]),
    () => engine.getSnapshot(),
  );
}

type Startup =
  | { state: 'starting' }
  | { state: 'ready'; services: Services }
  | { state: 'failed'; message: string };

export function ServicesProvider({ children }: { children: ReactNode }) {
  const [startup, setStartup] = useState<Startup>({ state: 'starting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    createServices().then(
      services => !cancelled && setStartup({ state: 'ready', services }),
      (err: unknown) =>
        !cancelled &&
        setStartup({
          state: 'failed',
          message: err instanceof Error ? err.message : String(err),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (startup.state === 'ready') {
    return (
      <ServicesContext.Provider value={startup.services}>
        {children}
      </ServicesContext.Provider>
    );
  }
  return (
    <View style={styles.center}>
      {startup.state === 'starting' ? (
        <ActivityIndicator size="large" color={theme.color.primary} />
      ) : (
        <>
          <Text style={styles.title}>SiteProof couldn't open its storage</Text>
          <Text style={styles.body}>
            Your saved reports are still on this phone. Try again, and if this
            keeps happening, restart the phone.
          </Text>
          <Text style={styles.detail}>{startup.message}</Text>
          <Button
            label="Try again"
            onPress={() => {
              setStartup({ state: 'starting' });
              setAttempt(n => n + 1);
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
    backgroundColor: theme.color.background,
  },
  title: { ...theme.text.title, textAlign: 'center' },
  body: { ...theme.text.body, textAlign: 'center' },
  detail: { ...theme.text.small, textAlign: 'center' },
});
