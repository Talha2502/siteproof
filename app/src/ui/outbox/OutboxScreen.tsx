import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useOutbox, useServices } from '../../app/ServicesProvider';
import {
  bannerText,
  describeReport,
  summaryText,
} from '../../core/reportStatus';
import type { LocalReport } from '../../core/types';
import { BrandHeader } from '../BrandHeader';
import { Icon } from '../Icon';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../theme';
import { ConnectivityBanner } from './ConnectivityBanner';
import { ReportRow } from './ReportRow';
import { useNow } from './useNow';

const pad = (n: number) => String(n).padStart(2, '0');

function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function whenText(iso: string, now: number): string {
  const date = new Date(iso);
  const today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today ${clockTime(iso)}`
    : `${date.getDate()}/${date.getMonth() + 1} ${clockTime(iso)}`;
}

export function OutboxScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const t = useTheme();
  const { engine } = useServices();
  const snapshot = useOutbox();
  const now = useNow();

  // Work that still needs to happen first, then what is done. Newest first in each.
  const sections = useMemo(() => {
    const newest = [...snapshot.reports].reverse();
    const onPhone = newest.filter(r => r.status !== 'delivered');
    const delivered = newest.filter(r => r.status === 'delivered');
    return [
      ...(onPhone.length > 0
        ? [{ title: 'On this phone', data: onPhone }]
        : []),
      ...(delivered.length > 0
        ? [{ title: 'Delivered', data: delivered }]
        : []),
    ];
  }, [snapshot.reports]);

  const onRemove = useCallback(
    (report: LocalReport) => {
      Alert.alert(
        'Remove this report?',
        "It hasn't reached the server. Removing it deletes its description and photos from this phone.",
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              engine.remove(report.id).catch(() => {
                Alert.alert("Couldn't remove the report", 'Please try again.');
              });
            },
          },
        ],
      );
    },
    [engine],
  );

  return (
    <View style={styles.screen}>
      <BrandHeader
        eyebrow="SiteProof"
        title="Outbox"
        right={<ConnectivityBanner online={snapshot.online} />}
        subtitle={bannerText(snapshot) ?? summaryText(snapshot)}
      >
        <SectionList
          sections={sections}
          keyExtractor={report => report.id}
          contentContainerStyle={
            sections.length === 0 ? styles.emptyContainer : styles.list
          }
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={[t.text.overline, styles.sectionTitle]}>
              {section.title}
            </Text>
          )}
          ItemSeparatorComponent={Gap}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: t.color.primarySoft },
                ]}
              >
                <Icon name="outbox" size={34} color={t.color.primary} />
              </View>
              <Text style={[t.text.title, styles.centered]}>
                No reports yet
              </Text>
              <Text
                style={[t.text.body, styles.centered, { color: t.color.body }]}
              >
                Reports are saved on this phone first, then sent to the server
                whenever there's a connection. You can keep working offline.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              when={whenText(item.createdAt, now)}
              status={describeReport(item, {
                online: snapshot.online,
                now,
                sending: snapshot.sending,
                formatTime: clockTime,
              })}
              onRemove={onRemove}
            />
          )}
        />
      </BrandHeader>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New report"
        onPress={() => navigation.navigate('Compose')}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: t.color.primary, boxShadow: t.color.fabShadow },
          pressed && styles.pressed,
        ]}
      >
        <Icon
          name="plus"
          size={22}
          color={t.color.onPrimary}
          strokeWidth={2.6}
        />
        <Text style={[t.text.button, { color: t.color.onPrimary }]}>
          New report
        </Text>
      </Pressable>
    </View>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, paddingBottom: 110 },
  sectionTitle: { marginHorizontal: 4, marginTop: 6, marginBottom: 10 },
  gap: { height: 12 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', paddingBottom: 80 },
  empty: { padding: 28, gap: 14, alignItems: 'center' },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    height: 56,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.9 },
});
