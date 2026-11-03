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
import { useTheme } from '../ui/theme';
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
    <StartupScreen
      failure={startup.state === 'failed' ? startup.message : undefined}
      onRetry={() => {
        setStartup({ state: 'starting' });
        setAttempt(n => n + 1);
      }}
    />
  );
}

/** Shown while storage opens (a moment), or if it can't. On the brand colour, so launch feels deliberate. */
function StartupScreen({
  failure,
  onRetry,
}: {
  failure?: string;
  onRetry: () => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.color.brand }]}>
      <Text style={[t.text.display, { color: t.color.brandInk }]}>
        SiteProof
      </Text>
      {failure === undefined ? (
        <ActivityIndicator size="large" color={t.color.brandMuted} />
      ) : (
        <View style={[styles.card, { backgroundColor: t.color.raised }]}>
          <Text style={[t.text.title, styles.centered]}>
            SiteProof couldn't open its storage
          </Text>
          <Text style={[t.text.body, styles.centered, { color: t.color.body }]}>
            Your saved reports are still on this phone. Try again, and if this
            keeps happening, restart the phone.
          </Text>
          <Text style={[t.text.small, styles.centered]}>{failure}</Text>
          <Button label="Try again" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  card: { alignSelf: 'stretch', borderRadius: 20, padding: 20, gap: 12 },
  centered: { textAlign: 'center' },
});
