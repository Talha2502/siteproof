import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StatusTone, StatusView } from '../../core/reportStatus';
import type { LocalReport } from '../../core/types';
import { Button } from '../Button';
import { theme } from '../theme';

interface ReportRowProps {
  report: LocalReport;
  status: StatusView;
  onRemove: (report: LocalReport) => void;
}

const TONE: Record<StatusTone, { fg: string; bg: string; icon: string }> = {
  saved: { fg: theme.color.pending, bg: theme.color.pendingBg, icon: '●' },
  moving: { fg: theme.color.primary, bg: '#E8EFFB', icon: '↑' },
  done: { fg: theme.color.success, bg: theme.color.successBg, icon: '✓' },
  attention: { fg: theme.color.danger, bg: theme.color.dangerBg, icon: '!' },
};

function ReportRowImpl({ report, status, onRemove }: ReportRowProps) {
  const tone = TONE[status.tone];
  // Photos stay on the phone until delivery; after that only the server has them.
  const thumbnails = report.status === 'delivered' ? [] : report.images;
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${report.description}. ${status.text}`}
    >
      <Text style={theme.text.body} numberOfLines={2}>
        {report.description}
      </Text>

      {thumbnails.length > 0 && (
        <View style={styles.thumbs}>
          {thumbnails.map(image => (
            <Image
              key={image.id}
              source={{ uri: `file://${image.localPath}` }}
              style={styles.thumb}
              resizeMode="cover"
              resizeMethod="resize"
            />
          ))}
        </View>
      )}

      <View style={[styles.status, { backgroundColor: tone.bg }]}>
        <Text style={[styles.icon, { color: tone.fg }]}>{tone.icon}</Text>
        <Text style={[styles.statusText, { color: tone.fg }]}>
          {status.text}
        </Text>
      </View>

      {status.progress !== undefined && (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(status.progress * 100)}%` },
            ]}
          />
        </View>
      )}

      {status.canRemove && (
        <Button
          label="Remove"
          variant="danger"
          onPress={() => onRemove(report)}
          accessibilityHint="Deletes this report from the phone"
        />
      )}
    </View>
  );
}

export const ReportRow = memo(ReportRowImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  thumbs: { flexDirection: 'row', gap: theme.space.xs },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.border,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.sm,
  },
  icon: { fontSize: 14, fontWeight: '700' },
  statusText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    overflow: 'hidden',
  },
  fill: { height: 4, backgroundColor: theme.color.primary },
});
