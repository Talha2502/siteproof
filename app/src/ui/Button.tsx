import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** primary: solid. tonal: soft fill. danger: red outline (destructive). */
  variant?: 'primary' | 'tonal' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  busy = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const t = useTheme();
  const c = t.color;
  const inactive = disabled || busy;
  const look = {
    primary: { bg: c.primary, fg: c.onPrimary, border: 'transparent' },
    tonal: { bg: c.primarySoft, fg: c.primary, border: 'transparent' },
    danger: { bg: 'transparent', fg: c.dangerFg, border: c.dangerFg },
  }[variant];
  const bg = inactive && variant === 'primary' ? c.line : look.bg;
  const fg = inactive ? c.muted : look.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={inactive}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: inactive && variant === 'danger' ? c.line : look.border,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === 'primary' ? c.onPrimary : c.primary}
        />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={20} color={fg} />}
          <Text
            style={[t.text.button, styles.label, { color: fg }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  label: { flexShrink: 1 },
  pressed: { opacity: 0.88 },
});
