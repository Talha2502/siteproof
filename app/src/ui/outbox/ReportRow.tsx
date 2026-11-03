import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StatusView } from '../../core/reportStatus';
import type { LocalReport } from '../../core/types';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { StatusLine } from '../StatusLine';
import { useTheme } from '../theme';

interface ReportRowProps {
  report: LocalReport;
  status: StatusView;
  /** e.g. "Today 14:30" */
  when: string;
  onRemove: (report: LocalReport) => void;
}

function ReportRowImpl({ report, status, when, onRemove }: ReportRowProps) {
  const t = useTheme();
  const c = t.color;
  const photos = `${report.images.length} ${
    report.images.length === 1 ? 'photo' : 'photos'
  }`;

  // Delivered: a quiet one-line row. The photos now live on the server (On server tab).
  if (report.status === 'delivered') {
    return (
      <View
        style={[
          styles.compact,
          { backgroundColor: c.raised, borderColor: c.line },
        ]}
        accessible
        accessibilityLabel={`${report.description}. ${status.text}`}
      >
        <View style={[styles.doneBadge, { backgroundColor: c.doneBg }]}>
          <Icon name="check" size={18} color={c.doneFg} strokeWidth={2.4} />
        </View>
        <View style={styles.grow}>
          <Text style={[t.text.label]} numberOfLines={1}>
            {report.description}
          </Text>
          <Text
            style={[
              styles.doneText,
              { color: c.doneFg, fontFamily: t.font.semibold },
            ]}
          >
            {status.text}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.raised, borderColor: c.line, boxShadow: c.shadow },
      ]}
      accessible
      accessibilityLabel={`${report.description}. ${when}, ${photos}. ${status.text}`}
    >
      <View style={styles.top}>
        <View style={styles.thumbs}>
          {report.images.slice(0, 3).map(image => (
            <Image
              key={image.id}
              source={{ uri: `file://${image.localPath}` }}
              style={[styles.thumb, { backgroundColor: c.placeholder }]}
              resizeMode="cover"
              resizeMethod="resize"
            />
          ))}
        </View>
        <View style={styles.grow}>
          <Text style={[t.text.label, styles.title]} numberOfLines={2}>
            {report.description}
          </Text>
          <Text style={t.text.small}>
            {when} · {photos}
          </Text>
        </View>
      </View>
      <StatusLine status={status} />
      {status.canRemove && (
        <Button
          label="Remove"
          variant="danger"
          icon="trash"
          onPress={() => onRemove(report)}
          accessibilityHint="Deletes this report from the phone"
        />
      )}
    </View>
  );
}

export const ReportRow = memo(ReportRowImpl);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 16 },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  doneBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 13 },
});
