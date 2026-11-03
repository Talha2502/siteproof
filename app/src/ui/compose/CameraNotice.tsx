import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { theme } from '../theme';

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
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={styles.title}>
        {kind === 'blocked'
          ? 'Camera access is off for SiteProof'
          : 'SiteProof needs the camera'}
      </Text>
      <Text style={styles.body}>
        {kind === 'blocked'
          ? 'To take site photos, turn on Camera in Settings, then come back here. You can still choose photos from the gallery.'
          : 'Camera access is used only to take site photos for your reports. You can still choose photos from the gallery.'}
      </Text>
      {kind === 'blocked' ? (
        <Button
          label="Open Settings"
          variant="secondary"
          onPress={onOpenSettings}
        />
      ) : (
        <Button label="Allow camera" variant="secondary" onPress={onAllow} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: theme.color.pendingBg,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  title: theme.text.heading,
  body: theme.text.body,
});
