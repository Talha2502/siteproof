import type { TextStyle } from 'react-native';

const color = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  border: '#DADDE3',
  text: '#15181D',
  muted: '#5B6270',
  primary: '#1F5FD1',
  onPrimary: '#FFFFFF',
  disabled: '#B8BEC9',
  /** On the server: done. */
  success: '#1B7F3B',
  successBg: '#E6F4EA',
  /** Saved on this phone, waiting. */
  pending: '#8A5A00',
  pendingBg: '#FFF4DC',
  /** Not sent: needs the user. */
  danger: '#B42318',
  dangerBg: '#FDECEA',
  overlay: 'rgba(21, 24, 29, 0.55)',
};

const text = {
  title: { fontSize: 20, fontWeight: '600', color: color.text },
  heading: { fontSize: 16, fontWeight: '600', color: color.text },
  body: { fontSize: 16, color: color.text },
  small: { fontSize: 14, color: color.muted },
} satisfies Record<string, TextStyle>;

export const theme = {
  color,
  text,
  space: { xs: 4, sm: 8, md: 16, lg: 24 },
  radius: { sm: 6, md: 10 },
  /** Minimum touch target (Android guidance: 48 dp). */
  touch: 48,
};
