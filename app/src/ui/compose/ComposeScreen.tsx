import { useHeaderHeight } from '@react-navigation/elements';
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkCameraAccess,
  openAppSettings,
  requestCameraAccess,
} from '../../adapters/cameraPermission';
import {
  pickFromGallery,
  takePhoto,
  type PickResult,
} from '../../adapters/photoPicker';
import {
  addDisabledReason,
  checkSubmit,
  hasContent,
  photoCounterText,
  slotsLeft,
} from '../../core/draft';
import { MAX_DESCRIPTION_LENGTH } from '../../core/engine';
import { Button } from '../Button';
import { theme } from '../theme';
import { CameraNotice } from './CameraNotice';
import { PhotoGrid } from './PhotoGrid';
import { useDraft } from './useDraft';

export function ComposeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { draft, setDescription, addPicked, remove, discard, submit } =
    useDraft();
  const [cameraNotice, setCameraNotice] = useState<'denied' | 'blocked'>();
  const [pickerError, setPickerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const check = checkSubmit(draft);
  const full = addDisabledReason(draft);

  // Permission granted in Settings? Notice it when the user comes back, no restart needed.
  useEffect(() => {
    if (!cameraNotice) return;
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'active' && (await checkCameraAccess()) === 'granted') {
        setCameraNotice(undefined);
      }
    });
    return () => sub.remove();
  }, [cameraNotice]);

  // Leaving with unsaved work asks first, and discarding deletes the processed photos.
  usePreventRemove(hasContent(draft) && !saved, ({ data }) => {
    Alert.alert(
      'Discard this report?',
      "It hasn't been saved. Its description and photos will be deleted.",
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discard().finally(() => navigation.dispatch(data.action));
          },
        },
      ],
    );
  });

  const handlePick = useCallback(
    (result: PickResult) => {
      setPickerError(undefined);
      if (result.kind === 'picked') addPicked(result.uris);
      else if (result.kind === 'permission_denied') setCameraNotice('blocked');
      else if (result.kind === 'unavailable') setPickerError(result.message);
    },
    [addPicked],
  );

  const onCamera = useCallback(async () => {
    if ((await checkCameraAccess()) !== 'granted') {
      const access = await requestCameraAccess();
      if (access !== 'granted') {
        setCameraNotice(access === 'blocked' ? 'blocked' : 'denied');
        return;
      }
    }
    setCameraNotice(undefined);
    handlePick(await takePhoto());
  }, [handlePick]);

  const onGallery = useCallback(async () => {
    handlePick(await pickFromGallery(slotsLeft(draft)));
  }, [draft, handlePick]);

  const onSubmit = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await submit();
      setSaved(true);
    } catch (err) {
      setSaveError(
        `Couldn't save on this phone. Your report is still here; try again. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    } finally {
      setSaving(false);
    }
  }, [submit]);

  // Navigate only after `saved` has disabled the discard prompt.
  useEffect(() => {
    if (!saved) return;
    if (Platform.OS === 'android') {
      ToastAndroid.show('Saved on this phone', ToastAndroid.SHORT);
    }
    navigation.goBack();
  }, [saved, navigation]);

  return (
    // Edge-to-edge (Android 15+) means the window no longer resizes for the
    // keyboard, so this screen makes room itself on both platforms.
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={theme.text.heading} nativeID="descriptionLabel">
            What did you find?
          </Text>
          <TextInput
            accessibilityLabelledBy="descriptionLabel"
            style={styles.input}
            value={draft.description}
            onChangeText={setDescription}
            placeholder="Describe the issue and where it is"
            placeholderTextColor={theme.color.muted}
            multiline
            maxLength={MAX_DESCRIPTION_LENGTH}
            textAlignVertical="top"
          />
          <Text style={[theme.text.small, styles.counter]}>
            {draft.description.length} / {MAX_DESCRIPTION_LENGTH}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={theme.text.heading}>Photos</Text>
            <Text style={theme.text.small}>{photoCounterText(draft)}</Text>
          </View>
          <PhotoGrid photos={draft.photos} onRemove={remove} />
          <View style={styles.row}>
            <Button
              label="Take photo"
              variant="secondary"
              onPress={onCamera}
              disabled={!!full}
              style={styles.grow}
            />
            <Button
              label="Choose photos"
              variant="secondary"
              onPress={onGallery}
              disabled={!!full}
              style={styles.grow}
            />
          </View>
          {full && <Text style={theme.text.small}>{full}</Text>}
          {pickerError && <Text style={styles.error}>{pickerError}</Text>}
          {cameraNotice && (
            <CameraNotice
              kind={cameraNotice}
              onAllow={onCamera}
              onOpenSettings={openAppSettings}
            />
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: theme.space.md + insets.bottom },
        ]}
      >
        {saveError && <Text style={styles.error}>{saveError}</Text>}
        {!check.ok && (
          <Text
            style={[theme.text.small, styles.reason]}
            accessibilityLiveRegion="polite"
          >
            {check.reason}
          </Text>
        )}
        <Button
          label="Submit report"
          onPress={onSubmit}
          disabled={!check.ok}
          busy={saving}
          accessibilityHint="Saves the report on this phone and sends it when there is a connection"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.lg },
  section: { gap: theme.space.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  grow: { flex: 1 },
  input: {
    ...theme.text.body,
    minHeight: 120,
    backgroundColor: theme.color.surface,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  counter: { alignSelf: 'flex-end' },
  error: { ...theme.text.small, color: theme.color.danger },
  reason: { textAlign: 'center' },
  footer: {
    padding: theme.space.md,
    gap: theme.space.sm,
    backgroundColor: theme.color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
});
