import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { DraftPhoto } from '../../core/draft';
import { Icon } from '../Icon';
import { useTheme } from '../theme';

interface PhotoGridProps {
  photos: DraftPhoto[];
  onRemove: (id: string) => void;
  /** Shows an "Add photo" tile when there is room for another. */
  onAdd?: () => void;
}

const GAP = 10;
const COLUMNS = 3;

export function PhotoGrid({ photos, onRemove, onAdd }: PhotoGridProps) {
  const t = useTheme();
  const c = t.color;
  // Explicit square sizes from the measured width: a percentage width with
  // aspectRatio in a wrapping row collapsed to zero height on Android.
  const [width, setWidth] = useState(0);
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);
  const tile = { width: size, height: size };

  return (
    <View
      style={styles.grid}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      {photos.map((photo, index) => (
        <View
          key={photo.id}
          style={[styles.tile, tile, { backgroundColor: c.placeholder }]}
          accessible
          accessibilityLabel={`Photo ${index + 1}, ${
            photo.state === 'ready'
              ? 'ready'
              : photo.state === 'processing'
              ? 'preparing'
              : `failed: ${photo.message}`
          }`}
        >
          {/* Only the processed photo is shown. Decoding a 20–75 MB original just
              for a thumbnail starved the resizer of memory and stalled it. */}
          {photo.state === 'ready' && (
            <Image
              source={{ uri: `file://${photo.image.localPath}` }}
              style={styles.fill}
              resizeMode="cover"
              resizeMethod="resize"
            />
          )}
          {photo.state === 'processing' && (
            <View
              style={[
                styles.fill,
                styles.overlay,
                { backgroundColor: c.scrim },
              ]}
            >
              <ActivityIndicator color="#FFFFFF" />
              <Text
                style={[styles.overlayText, { fontFamily: t.font.semibold }]}
              >
                Preparing…
              </Text>
            </View>
          )}
          {photo.state === 'failed' && (
            <View
              style={[
                styles.fill,
                styles.failed,
                { backgroundColor: c.dangerBg },
              ]}
            >
              <Icon name="alert" size={20} color={c.dangerFg} />
              <Text
                style={[
                  styles.failedText,
                  { color: c.dangerFg, fontFamily: t.font.medium },
                ]}
              >
                {photo.message}
              </Text>
            </View>
          )}
          <Pressable
            onPress={() => onRemove(photo.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}
            hitSlop={8}
            style={styles.remove}
          >
            <Icon name="close" size={14} color="#FFFFFF" strokeWidth={3} />
          </Pressable>
        </View>
      ))}
      {onAdd && size > 0 && (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          style={[styles.tile, styles.add, tile, { borderColor: c.line }]}
        >
          <Icon name="plus" size={24} color={c.muted} />
          <Text
            style={[
              styles.addText,
              { color: c.muted, fontFamily: t.font.semibold },
            ]}
          >
            Add photo
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: 16, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
  overlay: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  overlayText: { color: '#FFFFFF', fontSize: 12 },
  failed: { padding: 10, gap: 6, justifyContent: 'center' },
  failedText: { fontSize: 12, lineHeight: 16 },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addText: { fontSize: 13 },
});
