import { StyleSheet, Text, View } from 'react-native';
import type { StatusTone, StatusView } from '../core/reportStatus';
import { Icon, type IconName } from './Icon';
import { useTheme, type Palette } from './theme';

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
 * One report's status: an icon that says where the work is (a phone: saved
 * here; an arrow: moving; a check: on the server; an alert: needs you), the
 * words, and while uploading the percentage and a progress bar.
 */
export function StatusLine({ status }: { status: StatusView }) {
  const t = useTheme();
  const { fg, bg } = toneColors(t.color, status.tone);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: bg }]}>
          <Icon
            name={ICON[status.tone]}
            size={17}
            color={fg}
            strokeWidth={2.4}
          />
        </View>
        <Text style={[styles.text, { color: fg, fontFamily: t.font.semibold }]}>
          {status.headline ?? status.text}
        </Text>
        {status.percent !== undefined && (
          <Text
            style={[styles.percent, { color: fg, fontFamily: t.font.display }]}
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
  wrap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 15 },
  percent: { fontSize: 15 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
