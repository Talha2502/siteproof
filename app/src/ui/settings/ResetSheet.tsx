import { useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutbox, useServices } from '../../app/ServicesProvider';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { useTheme } from '../theme';

interface ResetSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Confirms Reset. If reports haven't reached the server, it names them: they would be lost for good. */
export function ResetSheet({ visible, onClose }: ResetSheetProps) {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { resetPhone } = useServices();
  const { reports } = useOutbox();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const unsent = reports.filter(report => report.status !== 'delivered');
  const n = unsent.length;

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const clean = await resetPhone();
      if (!clean) {
        setError("Some files couldn't be deleted. Try again.");
        return;
      }
      if (Platform.OS === 'android')
        ToastAndroid.show('This phone is reset', ToastAndroid.SHORT);
      onClose();
    } catch {
      setError(
        "Reset didn't finish. Nothing on the server was touched; try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel reset"
        />
        <View
          accessibilityRole="alert"
          style={[
            styles.sheet,
            { backgroundColor: c.raised, paddingBottom: 24 + insets.bottom },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: c.line }]} />
          <View style={styles.head}>
            <View style={[styles.badge, { backgroundColor: c.dangerBg }]}>
              <Icon
                name="alert"
                size={24}
                color={c.dangerFg}
                strokeWidth={2.2}
              />
            </View>
            <Text style={[t.text.title, styles.grow]}>
              {n > 0
                ? `${n} ${
                    n === 1 ? "report hasn't" : "reports haven't"
                  } reached the server`
                : 'Reset this phone?'}
            </Text>
          </View>
          <Text style={[t.text.body, { color: c.body }]}>
            {n > 0
              ? `Resetting deletes ${
                  n === 1 ? 'it' : 'them'
                } permanently, with ${n === 1 ? 'its' : 'their'} photos. ${
                  n === 1 ? 'It' : 'They'
                } can't be recovered.`
              : 'Every report and photo stored on this phone will be deleted.'}
          </Text>

          {n > 0 && (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {unsent.map(report => (
                <View
                  key={report.id}
                  style={[styles.item, { backgroundColor: c.dangerBg }]}
                >
                  <View style={styles.thumbs}>
                    {report.images.slice(0, 2).map(image => (
                      <Image
                        key={image.id}
                        source={{ uri: `file://${image.localPath}` }}
                        style={[
                          styles.thumb,
                          { backgroundColor: c.placeholder },
                        ]}
                        resizeMethod="resize"
                      />
                    ))}
                  </View>
                  <Text
                    style={[t.text.label, styles.grow, { color: c.dangerFg }]}
                    numberOfLines={2}
                  >
                    {report.description}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={t.text.small}>
            Reports already on the server are not affected.
          </Text>
          {error && (
            <Text style={[t.text.small, { color: c.dangerFg }]}>{error}</Text>
          )}

          <View style={styles.actions}>
            <Button
              label={
                n === 0
                  ? 'Cancel'
                  : n === 1
                  ? 'Keep my report'
                  : 'Keep my reports'
              }
              onPress={onClose}
              disabled={busy}
            />
            <Button
              label={
                n === 0
                  ? 'Reset this phone'
                  : n === 1
                  ? 'Delete it and reset'
                  : 'Delete them and reset'
              }
              variant="danger"
              onPress={confirm}
              busy={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 14,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  list: { flexGrow: 0, maxHeight: 220 },
  listContent: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
  },
  thumbs: { flexDirection: 'row', gap: 4 },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  actions: { gap: 10 },
});
