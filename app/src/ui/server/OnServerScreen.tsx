import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import type { ServerReport } from '../../adapters/reportsApi';
import { useServices } from '../../app/ServicesProvider';
import { BrandHeader } from '../BrandHeader';
import { Button } from '../Button';
import { Icon } from '../Icon';
import type { RootStackParams, TabParams } from '../navigation';
import { useTheme, type Theme } from '../theme';
import { useServerReports } from './useServerReports';

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function Received({ t, count }: { t: Theme; count: number }) {
  return (
    <View style={styles.received}>
      <Icon name="check" size={15} color={t.color.doneFg} strokeWidth={2.6} />
      <Text
        style={[
          styles.receivedText,
          { color: t.color.doneFg, fontFamily: t.font.semibold },
        ]}
      >
        {plural(count, 'photo', 'photos')} received
      </Text>
    </View>
  );
}

/** A photo served by the server, with a spinner until it has loaded (slow on 2G). */
function ServerPhoto({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const t = useTheme();
  const [loading, setLoading] = useState(true);
  return (
    <View
      style={[
        style,
        styles.photoWrap,
        { backgroundColor: t.color.placeholder },
      ]}
    >
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        resizeMethod="resize"
        onLoadEnd={() => setLoading(false)}
      />
      {loading && <ActivityIndicator size="small" color={t.color.muted} />}
    </View>
  );
}

function ReportCard({
  report,
  onOpen,
}: {
  report: ServerReport;
  onOpen: () => void;
}) {
  const t = useTheme();
  const c = t.color;
  const [first, second, third] = report.photoUrls;
  const more = report.photoUrls.length - 3;
  const photo = (uri: string | undefined, style: StyleProp<ImageStyle>) =>
    uri ? <ServerPhoto uri={uri} style={style} /> : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${report.description}. Received at ${clock(
        Date.parse(report.receivedAt),
      )}, ${plural(
        report.photoUrls.length,
        'photo',
        'photos',
      )}. Opens the report.`}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={[
        styles.card,
        { backgroundColor: c.raised, borderColor: c.line, boxShadow: c.shadow },
      ]}
    >
      {/* 2 photos side by side; 3 or more as a mosaic, with "+N" on the last tile. */}
      {report.photoUrls.length === 2 && (
        <View style={styles.pair}>
          {photo(first, styles.pairTile)}
          {photo(second, styles.pairTile)}
        </View>
      )}
      {report.photoUrls.length >= 3 && (
        <View style={styles.mosaic}>
          {photo(first, styles.mosaicMain)}
          <View style={styles.mosaicSide}>
            {photo(second, styles.mosaicSmall)}
            {more > 0 ? (
              <View
                style={[
                  styles.mosaicSmall,
                  styles.more,
                  { backgroundColor: c.placeholder },
                ]}
              >
                {photo(third, StyleSheet.absoluteFill)}
                <View style={[StyleSheet.absoluteFill, styles.moreScrim]} />
                <Text style={[styles.moreText, { fontFamily: t.font.display }]}>
                  +{more + 1}
                </Text>
              </View>
            ) : (
              photo(third, styles.mosaicSmall)
            )}
          </View>
        </View>
      )}
      <View
        style={[styles.cardBody, report.photoUrls.length === 1 && styles.row]}
      >
        {report.photoUrls.length === 1 && photo(first, styles.single)}
        <View style={styles.grow}>
          <View style={styles.titleRow}>
            <Text style={[t.text.label, styles.title]} numberOfLines={2}>
              {report.description}
            </Text>
            <Text style={t.text.small}>
              {clock(Date.parse(report.receivedAt))}
            </Text>
          </View>
          <Received t={t} count={report.photoUrls.length} />
        </View>
      </View>
    </Pressable>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

export function OnServerScreen() {
  const t = useTheme();
  const c = t.color;
  // A tab (can switch to Settings) inside the root stack (can open a report).
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        BottomTabNavigationProp<TabParams, 'OnServer'>,
        NativeStackNavigationProp<RootStackParams>
      >
    >();
  const { serverUrl } = useServices();
  const { state, refreshing, checking, refresh, retry } = useServerReports();

  const subtitle = (
    <View style={styles.subtitle}>
      {checking ? (
        <ActivityIndicator
          size="small"
          color={c.muted}
          style={styles.subtitleSpinner}
        />
      ) : (
        <View
          style={[
            styles.dot,
            {
              backgroundColor:
                state.kind === 'unreachable' ? c.offlineDot : c.onlineDot,
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.subtitleText,
          { color: c.brandMuted, fontFamily: t.font.regular },
        ]}
      >
        {state.kind === 'loading'
          ? 'Checking the server…'
          : state.kind === 'loaded'
          ? `${plural(
              state.reports.length,
              'report',
              'reports',
            )} · checked ${clock(state.checkedAt)} · pull to refresh`
          : `Not reachable · last tried ${clock(state.triedAt)}`}
      </Text>
    </View>
  );

  return (
    <BrandHeader
      eyebrow="SiteProof"
      title="On server"
      subtitle={subtitle}
      right={
        <Pressable
          onPress={retry}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          accessibilityState={{ busy: checking }}
          style={[styles.refresh, { backgroundColor: c.brandChip }]}
        >
          {checking ? (
            <ActivityIndicator size="small" color={c.brandInk} />
          ) : (
            <Icon
              name="refresh"
              size={20}
              color={c.brandInk}
              strokeWidth={2.2}
            />
          )}
        </Pressable>
      }
    >
      {state.kind === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      )}

      {state.kind === 'unreachable' && (
        <View style={styles.center}>
          <View style={[styles.halo, { backgroundColor: c.savedBg }]}>
            <View
              style={[
                styles.haloInner,
                { backgroundColor: c.raised, boxShadow: c.shadow },
              ]}
            >
              <Icon name="cloudOff" size={34} color={c.savedFg} />
            </View>
          </View>
          <Text style={[t.text.title, styles.centered]}>
            Can't reach the server right now
          </Text>
          <Text style={[t.text.body, styles.centered, { color: c.body }]}>
            This tab only shows what the server has confirmed, so there's
            nothing to show until it answers.
          </Text>
          <View
            style={[
              styles.safe,
              { backgroundColor: c.raised, borderColor: c.line },
            ]}
          >
            <Icon name="phone" size={18} color={c.savedFg} />
            <Text style={[t.text.small, styles.grow, { color: c.ink }]}>
              Your reports are safe in the Outbox and will go automatically.
            </Text>
          </View>
          <Button
            label="Try again"
            onPress={retry}
            busy={checking}
            style={styles.tryAgain}
          />
          <Text style={[t.text.small, styles.centered]}>
            {serverUrl()} ·{' '}
            <Text
              style={{ color: c.primary, fontFamily: t.font.semibold }}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="link"
            >
              Change server
            </Text>
          </Text>
        </View>
      )}

      {state.kind === 'loaded' && (
        <FlatList
          data={state.reports}
          keyExtractor={report => report.id}
          contentContainerStyle={
            state.reports.length === 0 ? styles.emptyContainer : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[c.primary]}
              progressBackgroundColor={c.raised}
            />
          }
          ItemSeparatorComponent={Gap}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={[styles.halo, { backgroundColor: c.doneBg }]}>
                <Icon name="cloudCheck" size={34} color={c.doneFg} />
              </View>
              <Text style={[t.text.title, styles.centered]}>
                Nothing on the server yet
              </Text>
              <Text style={[t.text.body, styles.centered, { color: c.body }]}>
                Reports appear here once the server has received them, with
                their photos.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ReportCard
              report={item}
              onOpen={() =>
                navigation.navigate('ServerReport', { report: item })
              }
            />
          )}
        />
      )}
    </BrandHeader>
  );
}

const styles = StyleSheet.create({
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subtitleText: { fontSize: 15, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  subtitleSpinner: { margin: -5, transform: [{ scale: 0.5 }] },
  refresh: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: 16, paddingTop: 20, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1 },
  gap: { height: 14 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 28,
  },
  centered: { textAlign: 'center' },
  halo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  tryAgain: { alignSelf: 'stretch' },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
    gap: 12,
    overflow: 'hidden',
  },
  pair: { flexDirection: 'row', gap: 6, height: 150 },
  pairTile: { flex: 1, borderRadius: 14 },
  mosaic: { flexDirection: 'row', gap: 6, height: 174 },
  mosaicMain: { flex: 2, borderRadius: 14 },
  mosaicSide: { flex: 1, gap: 6 },
  mosaicSmall: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  more: { alignItems: 'center', justifyContent: 'center' },
  photoWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreScrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  moreText: { color: '#FFFFFF', fontSize: 20 },
  cardBody: { paddingHorizontal: 6, paddingBottom: 6, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 0 },
  single: { width: 78, height: 78, borderRadius: 14 },
  grow: { flex: 1, minWidth: 0, gap: 6 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: { flex: 1, fontSize: 16 },
  received: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receivedText: { fontSize: 13 },
});
