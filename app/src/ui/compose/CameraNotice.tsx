import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { useTheme } from '../theme';

interface CameraNoticeProps {
  /** denied: Android will still show the prompt. blocked: only Settings can turn it on. */
  kind: 'denied' | 'blocked';
  onAllow: () => void;
  onOpenSettings: () => void;
}

export function CameraNotice({
  kind,
  onAllow,
  onOpenSettings,
}: CameraNoticeProps) {
  const t = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.box, { backgroundColor: c.savedBg }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: c.raised }]}>
          <Icon name="camera" size={18} color={c.savedFg} />
        </View>
        <Text style={[t.text.heading, styles.title, { color: c.savedFg }]}>
          {kind === 'blocked'
            ? 'Camera access is off for SiteProof'
            : 'SiteProof needs the camera'}
        </Text>
      </View>
      <Text style={[t.text.body, { color: c.body }]}>
        {kind === 'blocked'
          ? 'To take site photos, turn on Camera in Settings, then come back here. You can still choose photos from the gallery.'
          : 'Camera access is used only to take site photos for your reports. You can still choose photos from the gallery.'}
      </Text>
      {kind === 'blocked' ? (
        <Button
          label="Open Settings"
          variant="tonal"
          onPress={onOpenSettings}
        />
      ) : (
        <Button label="Allow camera" variant="tonal" onPress={onAllow} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 18, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
});
