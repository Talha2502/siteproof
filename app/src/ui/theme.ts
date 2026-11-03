import { useColorScheme, type TextStyle } from 'react-native';

// Harbor (light) and Slate night (dark), chosen by the phone's dark-mode
// setting. Text colours meet 4.5:1 on their backgrounds, and the four status
// colours differ in lightness as well as hue.

export interface Palette {
  /** The navy header band. */
  brand: string;
  brandInk: string;
  brandMuted: string;
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
  /** Status dot inside the brand band. */
  offlineDot: string;
  onlineDot: string;
}

const harbor: Palette = {
  brand: '#0E1A3A',
  brandInk: '#FFFFFF',
  brandMuted: '#AEB9D6',
  brandChip: 'rgba(255,255,255,0.12)',
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  ink: '#0F172A',
  body: '#334155',
  muted: '#5B6476',
  line: '#E2E7EF',
  primary: '#2B5BE0',
  onPrimary: '#FFFFFF',
  primarySoft: '#E8EEFD',
  savedFg: '#8A5300',
  savedBg: '#FFF2D3',
  doneFg: '#13693F',
  doneBg: '#E0F2E8',
  dangerFg: '#B42318',
  dangerBg: '#FDEBE9',
  scrim: 'rgba(15,23,42,0.55)',
  shadow: '0px 1px 2px rgba(15,23,42,0.05), 0px 8px 24px rgba(15,23,42,0.07)',
  fabShadow: '0px 6px 20px rgba(43,91,224,0.35)',
  placeholder: '#D9DFEA',
  offlineDot: '#F4C46C',
  onlineDot: '#74D4A0',
};

const slateNight: Palette = {
  brand: '#121A2C',
  brandInk: '#EEF2F8',
  brandMuted: '#97A1B4',
  brandChip: 'rgba(255,255,255,0.08)',
  bg: '#0B1019',
  surface: '#141B29',
  raised: '#182133',
  ink: '#EEF2F8',
  body: '#C9D1DE',
  muted: '#97A1B4',
  line: '#253049',
  primary: '#89A9FF',
  onPrimary: '#0B1020',
  primarySoft: '#1C2948',
  savedFg: '#F4C46C',
  savedBg: '#32270E',
  doneFg: '#74D4A0',
  doneBg: '#112E1E',
  dangerFg: '#FF9080',
  dangerBg: '#3A1916',
  scrim: 'rgba(0,0,0,0.62)',
  shadow: '0px 1px 2px rgba(0,0,0,0.5)',
  fabShadow: '0px 6px 20px rgba(0,0,0,0.5)',
  placeholder: '#222C42',
  offlineDot: '#F4C46C',
  onlineDot: '#74D4A0',
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

const light = makeTheme(harbor, false);
const dark = makeTheme(slateNight, true);

/** The current theme. Re-renders when the phone switches dark mode on or off. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
