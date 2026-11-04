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
 * A large title on the page background, with the screen's content below it.
 * The header runs under the status bar (edge-to-edge), so it pads by the top inset.
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
          { backgroundColor: t.color.brand, paddingTop: insets.top + 8 },
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
  band: { paddingHorizontal: 20, paddingBottom: 6, gap: 6 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  subtitle: { fontSize: 15 },
  sheet: { flex: 1 },
});
