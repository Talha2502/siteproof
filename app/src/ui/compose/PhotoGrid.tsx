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
import { theme } from '../theme';

interface PhotoGridProps {
  photos: DraftPhoto[];
  onRemove: (id: string) => void;
}

export function PhotoGrid({ photos, onRemove }: PhotoGridProps) {
  // Explicit square sizes from the measured width: a percentage width with
  // aspectRatio in a wrapping row collapsed to zero height on Android.
  const [width, setWidth] = useState(0);
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);
  if (photos.length === 0) return null;
  return (
    <View
      style={styles.grid}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      {photos.map((photo, index) => (
        <View
          key={photo.id}
          style={[styles.tile, { width: size, height: size }]}
          accessible
          accessibilityLabel={`Photo ${index + 1}, ${
            photo.state === 'ready'
              ? 'ready'
              : photo.state === 'processing'
              ? 'preparing'
              : `failed: ${photo.message}`
          }`}
        >
          {photo.state === 'failed' && (
            <View style={[styles.fill, styles.failed]}>
              <Text style={styles.failedText}>{photo.message}</Text>
            </View>
          )}
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
            <View style={[styles.fill, styles.overlay]}>
              <ActivityIndicator color={theme.color.onPrimary} />
              <Text style={styles.overlayText}>Preparing…</Text>
            </View>
          )}
          <Pressable
            onPress={() => onRemove(photo.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}
            hitSlop={8}
            style={styles.remove}
          >
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const GAP = theme.space.sm;
const COLUMNS = 3;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    backgroundColor: theme.color.border,
  },
  fill: { ...StyleSheet.absoluteFill },
  overlay: {
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  overlayText: {
    color: theme.color.onPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  failed: {
    backgroundColor: theme.color.dangerBg,
    padding: theme.space.sm,
    paddingTop: 36,
  },
  failedText: { color: theme.color.danger, fontSize: 12 },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: theme.color.onPrimary, fontSize: 16, fontWeight: '700' },
});
