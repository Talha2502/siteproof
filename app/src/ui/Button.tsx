import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || busy;
  const primary = variant === 'primary';
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
        primary ? styles.primary : styles.secondary,
        variant === 'danger' && styles.danger,
        inactive &&
          (primary ? styles.primaryDisabled : styles.secondaryDisabled),
        pressed && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={primary ? theme.color.onPrimary : theme.color.primary}
        />
      ) : (
        <Text
          style={[
            styles.label,
            primary ? styles.labelPrimary : styles.labelSecondary,
            variant === 'danger' && styles.labelDanger,
            inactive && !primary && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.touch,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: { backgroundColor: theme.color.primary },
  primaryDisabled: { backgroundColor: theme.color.disabled },
  secondary: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  secondaryDisabled: { backgroundColor: theme.color.background },
  danger: { borderColor: theme.color.danger },
  pressed: { opacity: 0.85 },
  label: { fontSize: 16, fontWeight: '600' },
  labelPrimary: { color: theme.color.onPrimary },
  labelSecondary: { color: theme.color.primary },
  labelDanger: { color: theme.color.danger },
  labelDisabled: { color: theme.color.disabled },
});
