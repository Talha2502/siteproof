import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photoSize } from '../../adapters/reportsApi';
import { MAX_IMAGE_BYTES } from '../../core/engine';
import { Icon } from '../Icon';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParams, 'ServerReport'>;

const pad = (n: number) => String(n).padStart(2, '0');
function clock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function day(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? 'today'
    : `on ${d.getDate()}/${d.getMonth() + 1}`;
}

interface PhotoFacts {
  bytes?: number;
  width?: number;
  height?: number;
}

/** Size from the server's Content-Length, dimensions from the image itself: proof of what arrived. */
function usePhotoFacts(url: string | undefined): PhotoFacts {
  const [facts, setFacts] = useState<PhotoFacts>({});
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setFacts({});
    photoSize(url).then(bytes => alive && setFacts(f => ({ ...f, bytes })));
    Image.getSize(
      url,
      (width, height) => alive && setFacts(f => ({ ...f, width, height })),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return facts;
}

export function ServerReportScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(0);
  const [heroLoading, setHeroLoading] = useState(true);
  const url = report.photoUrls[selected];
  const facts = usePhotoFacts(url);
  const total = report.photoUrls.length;

  const caption = [
    `Photo ${selected + 1} of ${total}`,
    facts.bytes !== undefined
      ? `${(facts.bytes / 1024 / 1024).toFixed(2)} MB`
      : undefined,
    facts.width && facts.height
      ? `${facts.width} × ${facts.height}`
      : undefined,
    facts.bytes !== undefined && facts.bytes <= MAX_IMAGE_BYTES
      ? 'under the 5 MB limit'
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      {/* The photo runs under the status bar: light icons, restored on leaving. */}
      <StatusBar barStyle="light-content" />
      <View style={[styles.hero, { backgroundColor: c.placeholder }]}>
        {url && (
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoadStart={() => setHeroLoading(true)}
            onLoadEnd={() => setHeroLoading(false)}
            accessibilityLabel={`Photo ${
              selected + 1
            } of ${total}, loaded from the server`}
          />
        )}
        {heroLoading && (
          <ActivityIndicator style={styles.heroSpinner} color={c.muted} />
        )}
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to On server"
          style={[styles.back, { top: insets.top + 12 }]}
        >
          <Icon name="back" size={22} color="#1C1917" strokeWidth={2.4} />
        </Pressable>
        {total > 1 && (
          <View style={styles.counter}>
            <Text style={[styles.counterText, { fontFamily: t.font.semibold }]}>
              {selected + 1} / {total}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={[styles.sheet, { backgroundColor: c.bg }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <Text
          style={
            report.description.length <= 90
              ? t.text.title
              : [t.text.body, { fontFamily: t.font.medium }]
          }
        >
          {report.description}
        </Text>

        <View style={[styles.receipt, { backgroundColor: c.doneBg }]}>
          <View style={[styles.receiptBadge, { backgroundColor: c.doneFg }]}>
            <Icon name="check" size={17} color={c.doneBg} strokeWidth={2.8} />
          </View>
          <View style={styles.grow}>
            <Text
              style={[
                styles.receiptTitle,
                { color: c.doneFg, fontFamily: t.font.semibold },
              ]}
            >
              Received by the server · {clock(report.receivedAt)}
            </Text>
            <Text style={[t.text.small, { color: c.body }]}>
              Filed on the phone {day(report.createdAt)} at{' '}
              {clock(report.createdAt)}
            </Text>
          </View>
        </View>

        {total > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {report.photoUrls.map((photoUrl, index) => (
              <Pressable
                key={photoUrl}
                onPress={() => setSelected(index)}
                accessibilityRole="button"
                accessibilityLabel={`Show photo ${index + 1}`}
                accessibilityState={{ selected: index === selected }}
                style={[
                  styles.thumbFrame,
                  index === selected && { borderColor: c.primary },
                ]}
              >
                <Image
                  source={{ uri: photoUrl }}
                  style={[styles.thumb, { backgroundColor: c.placeholder }]}
                  resizeMode="cover"
                  resizeMethod="resize"
                />
              </Pressable>
            ))}
          </ScrollView>
        )}
        <Text style={t.text.small}>{caption}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { height: 340, alignItems: 'center', justifyContent: 'center' },
  heroSpinner: { position: 'absolute' },
  back: {
    position: 'absolute',
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    boxShadow: '0px 2px 10px rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    right: 14,
    bottom: 38,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  counterText: { color: '#FFFFFF', fontSize: 13 },
  sheet: {
    flex: 1,
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  content: { padding: 18, paddingTop: 22, gap: 16 },
  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
  },
  receiptBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTitle: { fontSize: 15 },
  grow: { flex: 1, gap: 2 },
  strip: { gap: 6 },
  thumbFrame: {
    borderWidth: 3,
    borderRadius: 17,
    padding: 2,
    borderColor: 'transparent',
  },
  thumb: { width: 72, height: 72, borderRadius: 12 },
});
