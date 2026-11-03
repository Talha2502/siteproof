import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function ConnectivityBanner({ text }: { text: string }) {
  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dot} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm + 2,
    backgroundColor: theme.color.pendingBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.pending,
  },
  text: {
    ...theme.text.body,
    color: theme.color.pending,
    fontWeight: '600',
    flex: 1,
  },
});
