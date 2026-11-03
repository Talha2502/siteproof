import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/** The online/offline pill in the Outbox's header band. */
export function ConnectivityBanner({
  online,
}: {
  online: boolean | undefined;
}) {
  const t = useTheme();
  if (online === undefined) return null;
  return (
    <View
      style={[styles.pill, { backgroundColor: t.color.brandChip }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: online ? t.color.onlineDot : t.color.offlineDot },
        ]}
      />
      <Text
        style={[
          styles.text,
          { color: t.color.brandInk, fontFamily: t.font.semibold },
        ]}
      >
        {online ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 13 },
});
