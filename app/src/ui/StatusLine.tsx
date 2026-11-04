import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { StatusTone, StatusView } from '../core/reportStatus';
import { Icon, type IconName } from './Icon';
import { useTheme, type Palette } from './theme';

// 'moving' shows a spinner instead (status.active); its icon is the fallback.
const ICON: Record<StatusTone, IconName> = {
  saved: 'phone',
  moving: 'upload',
  done: 'check',
  attention: 'alert',
};

export function toneColors(
  c: Palette,
  tone: StatusTone,
): { fg: string; bg: string } {
  switch (tone) {
    case 'saved':
      return { fg: c.savedFg, bg: c.savedBg };
    case 'moving':
      return { fg: c.primary, bg: c.primarySoft };
    case 'done':
      return { fg: c.doneFg, bg: c.doneBg };
    case 'attention':
      return { fg: c.dangerFg, bg: c.dangerBg };
  }
}

/**
 * One report's status as a tinted pill: an icon that says where the work is (a
 * phone: saved here; a check: on the server; an alert: needs you), or a spinner
 * while work is happening, then the words. While uploading, the percentage sits
 * beside the pill and a progress bar runs underneath.
 */
export function StatusLine({ status }: { status: StatusView }) {
  const t = useTheme();
  const { fg, bg } = toneColors(t.color, status.tone);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.pill, { backgroundColor: bg }]}>
          {status.active ? (
            <ActivityIndicator size="small" color={fg} style={styles.spinner} />
          ) : (
            <Icon
              name={ICON[status.tone]}
              size={15}
              color={fg}
              strokeWidth={2.4}
            />
          )}
          <Text
            style={[styles.text, { color: fg, fontFamily: t.font.semibold }]}
          >
            {status.headline ?? status.text}
          </Text>
        </View>
        {status.percent !== undefined && (
          <Text
            style={[
              styles.percent,
              { color: t.color.ink, fontFamily: t.font.display },
            ]}
          >
            {status.percent}%
          </Text>
        )}
      </View>
      {status.progress !== undefined && (
        <View style={[styles.track, { backgroundColor: t.color.primarySoft }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: t.color.primary,
                width: `${Math.round(status.progress * 100)}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    flexShrink: 1,
  },
  // The small spinner is 20 dp: scale it down, and pull the margins in to match.
  spinner: { margin: -2, transform: [{ scale: 0.8 }] },
  text: { flexShrink: 1, fontSize: 13.5 },
  percent: { marginLeft: 'auto', fontSize: 15 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
});
