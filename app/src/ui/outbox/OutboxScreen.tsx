import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutbox, useServices } from '../../app/ServicesProvider';
import { bannerText, describeReport } from '../../core/reportStatus';
import type { LocalReport } from '../../core/types';
import { Button } from '../Button';
import type { RootStackParams } from '../navigation';
import { theme } from '../theme';
import { ConnectivityBanner } from './ConnectivityBanner';
import { ReportRow } from './ReportRow';
import { useNow } from './useNow';

function clockTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OutboxScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const insets = useSafeAreaInsets();
  const { engine } = useServices();
  const snapshot = useOutbox();
  const now = useNow();

  // Newest first for the person reading; the engine still sends oldest first.
  const rows = useMemo(
    () => [...snapshot.reports].reverse(),
    [snapshot.reports],
  );
  const banner = bannerText(snapshot);

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
      {banner && <ConnectivityBanner text={banner} />}
      <FlatList
        data={rows}
        keyExtractor={report => report.id}
        contentContainerStyle={
          rows.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={theme.text.title}>No reports yet</Text>
            <Text style={[theme.text.body, styles.emptyBody]}>
              Reports are saved on this phone first, then sent to the server
              whenever there's a connection. You can keep working offline.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ReportRow
            report={item}
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
      <View
        style={[
          styles.footer,
          { paddingBottom: theme.space.md + insets.bottom },
        ]}
      >
        <Button
          label="New report"
          onPress={() => navigation.navigate('Compose')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  list: { padding: theme.space.md, gap: theme.space.sm },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { padding: theme.space.lg, gap: theme.space.sm, alignItems: 'center' },
  emptyBody: { textAlign: 'center', color: theme.color.muted },
  footer: {
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.md,
    backgroundColor: theme.color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
});
