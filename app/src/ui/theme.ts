import { useColorScheme, type TextStyle } from 'react-native';

// Daylight (light) and Night (dark), chosen by the phone's dark-mode setting.
// Neutral surfaces with one accent (the icon's blue); colour is kept for meaning:
// amber = saved on this phone, blue = moving, green = on the server, red = needs you.
// Text colours meet 4.5:1 on their backgrounds.

export interface Palette {
  /** The header area behind the large title. */
  brand: string;
  brandInk: string;
  brandMuted: string;
  /** Round controls in the header (close, refresh) and the online pill. */
  brandChip: string;
  bg: string;
  surface: string;
  raised: string;
  ink: string;
  body: string;
  muted: string;
  line: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  /** Saved on this phone, waiting. */
  savedFg: string;
  savedBg: string;
  /** On the server. */
  doneFg: string;
  doneBg: string;
  /** Not sent: needs the user. */
  dangerFg: string;
  dangerBg: string;
  scrim: string;
  shadow: string;
  fabShadow: string;
  placeholder: string;
  offlineDot: string;
  onlineDot: string;
}

const daylight: Palette = {
  brand: '#F6F7F9',
  brandInk: '#0B0D12',
  brandMuted: '#5F6672',
  brandChip: '#EAECF0',
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  ink: '#0B0D12',
  body: '#3A404C',
  muted: '#5F6672',
  line: '#E4E7EC',
  primary: '#2B5BE0',
  onPrimary: '#FFFFFF',
  primarySoft: '#EDF2FE',
  savedFg: '#8F5200',
  savedBg: '#FDF1DA',
  doneFg: '#14713F',
  doneBg: '#E3F4EA',
  dangerFg: '#B9232B',
  dangerBg: '#FDECEC',
  scrim: 'rgba(11,13,18,0.5)',
  shadow: '0px 1px 2px rgba(11,13,18,0.04), 0px 4px 16px rgba(11,13,18,0.05)',
  fabShadow: '0px 6px 20px rgba(43,91,224,0.32)',
  placeholder: '#E9ECF1',
  offlineDot: '#D98A00',
  onlineDot: '#1F9D57',
};

const night: Palette = {
  brand: '#0B0C0F',
  brandInk: '#F2F3F5',
  brandMuted: '#8D929C',
  brandChip: '#1C1F25',
  bg: '#0B0C0F',
  surface: '#141619',
  raised: '#17191D',
  ink: '#F2F3F5',
  body: '#C9CCD3',
  muted: '#8D929C',
  line: '#24272D',
  primary: '#7D9DFF',
  onPrimary: '#0B0C0F',
  primarySoft: '#1A2236',
  savedFg: '#F2C26B',
  savedBg: '#2B2210',
  doneFg: '#6FD39B',
  doneBg: '#11281B',
  dangerFg: '#FF8A80',
  dangerBg: '#321616',
  scrim: 'rgba(0,0,0,0.62)',
  shadow: '0px 1px 2px rgba(0,0,0,0.5)',
  fabShadow: '0px 6px 20px rgba(0,0,0,0.5)',
  placeholder: '#22252B',
  offlineDot: '#F2C26B',
  onlineDot: '#6FD39B',
};

/** Bundled fonts (assets/fonts). Each weight is its own file, so no fontWeight is set alongside. */
export const font = {
  display: 'Manrope-ExtraBold',
  displayBold: 'Manrope-Bold',
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
export const radius = { sm: 10, md: 14, lg: 18, xl: 24 };
/** Minimum touch target (Android guidance: 48 dp). */
export const touch = 48;

function textStyles(c: Palette) {
  return {
    display: {
      fontFamily: font.display,
      fontSize: 34,
      letterSpacing: -0.8,
      color: c.ink,
    },
    title: {
      fontFamily: font.display,
      fontSize: 22,
      letterSpacing: -0.3,
      color: c.ink,
    },
    heading: { fontFamily: font.display, fontSize: 17, color: c.ink },
    overline: {
      fontFamily: font.displayBold,
      fontSize: 13,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: c.muted,
    },
    body: {
      fontFamily: font.regular,
      fontSize: 16,
      lineHeight: 23,
      color: c.ink,
    },
    label: { fontFamily: font.semibold, fontSize: 15, color: c.ink },
    small: {
      fontFamily: font.regular,
      fontSize: 13,
      lineHeight: 18,
      color: c.muted,
    },
    button: { fontFamily: font.displayBold, fontSize: 16 },
  } satisfies Record<string, TextStyle>;
}

function makeTheme(color: Palette, dark: boolean) {
  return { color, dark, font, space, radius, touch, text: textStyles(color) };
}

export type Theme = ReturnType<typeof makeTheme>;

const light = makeTheme(daylight, false);
const dark = makeTheme(night, true);

/** The current theme. Re-renders when the phone switches dark mode on or off. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
