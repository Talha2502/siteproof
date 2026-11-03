import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

interface BrandHeaderProps {
  title: string;
  /** Small caps line above the title, e.g. "SiteProof". */
  eyebrow?: string;
  subtitle?: ReactNode;
  /** Top-right control (refresh, connectivity pill). */
  right?: ReactNode;
  /** Top-left control (close, back). Replaces the eyebrow row's left side. */
  left?: ReactNode;
  children: ReactNode;
}

/**
 * The navy band with a large title, and the rounded sheet that overlaps it.
 * The band runs under the status bar (edge-to-edge), so it pads by the top inset.
 */
export function BrandHeader({
  title,
  eyebrow,
  subtitle,
  right,
  left,
  children,
}: BrandHeaderProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: t.color.bg }]}>
      <View
        style={[
          styles.band,
          { backgroundColor: t.color.brand, paddingTop: insets.top + 18 },
        ]}
      >
        {(eyebrow || right || left) && (
          <View style={styles.topRow}>
            {left ?? (
              <Text style={[t.text.overline, { color: t.color.brandMuted }]}>
                {eyebrow}
              </Text>
            )}
            {right}
          </View>
        )}
        <Text
          accessibilityRole="header"
          style={[t.text.display, { color: t.color.brandInk }]}
        >
          {title}
        </Text>
        {subtitle !== undefined &&
          (typeof subtitle === 'string' ? (
            <Text
              style={[
                styles.subtitle,
                { color: t.color.brandMuted, fontFamily: t.font.regular },
              ]}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle
          ))}
      </View>
      <View style={[styles.sheet, { backgroundColor: t.color.bg }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  band: { paddingHorizontal: 22, paddingBottom: 40, gap: 10 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  subtitle: { fontSize: 15 },
  sheet: {
    flex: 1,
    marginTop: -22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
});
