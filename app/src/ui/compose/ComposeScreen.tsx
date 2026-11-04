import { usePreventRemove, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  photoCount,
  slotsLeft,
} from '../../core/draft';
import { MAX_DESCRIPTION_LENGTH, MAX_IMAGES } from '../../core/engine';
import { BrandHeader } from '../BrandHeader';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { useTheme } from '../theme';
import { CameraNotice } from './CameraNotice';
import { PhotoGrid } from './PhotoGrid';
import { useDraft } from './useDraft';

export function ComposeScreen() {
  const navigation = useNavigation();
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { draft, setDescription, addPicked, remove, discard, submit } =
    useDraft();
  const [cameraNotice, setCameraNotice] = useState<'denied' | 'blocked'>();
  const [pickerError, setPickerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const check = checkSubmit(draft);
  const full = addDisabledReason(draft);
  const processing = draft.photos.some(photo => photo.state === 'processing');

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

  const onAddTile = useCallback(() => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: onCamera },
      { text: 'Choose from gallery', onPress: onGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [onCamera, onGallery]);

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
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <BrandHeader
        title="New report"
        subtitle="Saved on this phone the moment you submit"
        left={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={[styles.close, { backgroundColor: c.brandChip }]}
          >
            <Icon name="close" size={22} color={c.brandInk} strokeWidth={2.4} />
          </Pressable>
        }
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text
              style={[t.text.heading, styles.indent]}
              nativeID="descriptionLabel"
            >
              What did you find?
            </Text>
            <TextInput
              accessibilityLabelledBy="descriptionLabel"
              style={[
                styles.input,
                {
                  backgroundColor: c.raised,
                  borderColor: c.line,
                  color: c.ink,
                  fontFamily: t.font.regular,
                },
              ]}
              value={draft.description}
              onChangeText={setDescription}
              placeholder="Describe the issue and where it is"
              placeholderTextColor={c.muted}
              multiline
              maxLength={MAX_DESCRIPTION_LENGTH}
              textAlignVertical="top"
            />
            <Text style={[t.text.small, styles.counter]}>
              {draft.description.length} / {MAX_DESCRIPTION_LENGTH}
            </Text>
          </View>

          <View style={styles.section}>
            <View style={[styles.row, styles.indent]}>
              <Text style={t.text.heading}>Photos</Text>
              <View style={[styles.chip, { backgroundColor: c.primarySoft }]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: c.primary, fontFamily: t.font.semibold },
                  ]}
                >
                  {photoCount(draft)} of {MAX_IMAGES} photos
                </Text>
              </View>
            </View>
            <PhotoGrid
              photos={draft.photos}
              onRemove={remove}
              onAdd={full ? undefined : onAddTile}
            />
            <View style={styles.row}>
              <Button
                label="Take photo"
                icon="camera"
                variant="tonal"
                onPress={onCamera}
                disabled={!!full}
                style={styles.grow}
              />
              <Button
                label="Gallery"
                icon="image"
                variant="tonal"
                onPress={onGallery}
                disabled={!!full}
                style={styles.grow}
              />
            </View>
            {full && <Text style={[t.text.small, styles.indent]}>{full}</Text>}
            {pickerError && (
              <Text style={[t.text.small, { color: c.dangerFg }]}>
                {pickerError}
              </Text>
            )}
            {cameraNotice && (
              <CameraNotice
                kind={cameraNotice}
                onAllow={onCamera}
                onOpenSettings={openAppSettings}
              />
            )}
          </View>
        </ScrollView>
      </BrandHeader>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.surface,
            borderTopColor: c.line,
            paddingBottom: 16 + insets.bottom,
          },
        ]}
      >
        {saveError && (
          <Text style={[t.text.small, { color: c.dangerFg }]}>{saveError}</Text>
        )}
        {!check.ok && (
          <View style={styles.reason} accessibilityLiveRegion="polite">
            <Icon
              name={processing ? 'clock' : 'alert'}
              size={16}
              color={c.muted}
              strokeWidth={2.2}
            />
            <Text style={t.text.small}>{check.reason}</Text>
          </View>
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
  screen: { flex: 1 },
  content: { padding: 16, paddingTop: 22, gap: 22 },
  section: { gap: 10 },
  indent: { marginHorizontal: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  grow: { flex: 1 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 112,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    lineHeight: 23,
  },
  counter: { alignSelf: 'flex-end', marginRight: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 13 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
