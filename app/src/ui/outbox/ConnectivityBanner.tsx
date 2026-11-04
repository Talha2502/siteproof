import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/** The online/offline pill in the Outbox's header. Until the phone knows, it says so. */
export function ConnectivityBanner({
  online,
}: {
  online: boolean | undefined;
}) {
  const t = useTheme();
  return (
    <View
      style={[styles.pill, { backgroundColor: t.color.brandChip }]}
      accessibilityLiveRegion="polite"
    >
      {online === undefined ? (
        <ActivityIndicator
          size="small"
          color={t.color.muted}
          style={styles.spinner}
        />
      ) : (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: online ? t.color.onlineDot : t.color.offlineDot,
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          { color: t.color.brandInk, fontFamily: t.font.semibold },
        ]}
      >
        {online === undefined ? 'Checking…' : online ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  spinner: { margin: -4, transform: [{ scale: 0.6 }] },
  text: { fontSize: 13 },
});
