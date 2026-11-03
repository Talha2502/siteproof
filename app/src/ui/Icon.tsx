import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'upload'
  | 'phone'
  | 'check'
  | 'alert'
  | 'plus'
  | 'close'
  | 'camera'
  | 'image'
  | 'refresh'
  | 'back'
  | 'outbox'
  | 'cloudCheck'
  | 'cloudOff'
  | 'sliders'
  | 'server'
  | 'trash'
  | 'clock';

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** Stroke icons (24-unit grid), decorative: the text next to them carries the meaning. */
export function Icon({ name, size = 22, color, strokeWidth = 2 }: IconProps) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'upload' && (
        <>
          <Path d="M12 19V5" {...stroke} />
          <Path d="m6 11 6-6 6 6" {...stroke} />
        </>
      )}
      {name === 'phone' && (
        <>
          <Rect x={7} y={2.5} width={10} height={19} rx={2.5} {...stroke} />
          <Path d="M11 18h2" {...stroke} />
        </>
      )}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} />}
      {name === 'alert' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 8v5" {...stroke} />
          <Path d="M12 16.5h.01" {...stroke} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...stroke} />}
      {name === 'camera' && (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3v11H4z" {...stroke} />
          <Circle cx={12} cy={13} r={3.5} {...stroke} />
        </>
      )}
      {name === 'image' && (
        <>
          <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} {...stroke} />
          <Circle cx={9} cy={10} r={1.6} {...stroke} />
          <Path d="m20.5 16-5-5-8 8.5" {...stroke} />
        </>
      )}
      {name === 'refresh' && (
        <>
          <Path d="M21 12a9 9 0 1 1-2.64-6.36" {...stroke} />
          <Path d="M21 3v6h-6" {...stroke} />
        </>
      )}
      {name === 'back' && (
        <>
          <Path d="M19 12H5" {...stroke} />
          <Path d="m12 19-7-7 7-7" {...stroke} />
        </>
      )}
      {name === 'outbox' && (
        <>
          <Path d="M4 13h4l2 3h4l2-3h4" {...stroke} />
          <Path
            d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
            {...stroke}
          />
        </>
      )}
      {name === 'cloudCheck' && (
        <>
          <Path
            d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z"
            {...stroke}
          />
          <Path d="m9.5 13.5 2 2 3.5-4" {...stroke} />
        </>
      )}
      {name === 'cloudOff' && (
        <>
          <Path d="M7 18a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 3-3.6" {...stroke} />
          <Path d="M13.5 6.2A6 6 0 0 1 18 8.5a4 4 0 0 1 1.9 7.2" {...stroke} />
          <Path d="M3 3l18 18" {...stroke} />
        </>
      )}
      {name === 'sliders' && (
        <>
          <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...stroke} />
          <Circle cx={16} cy={7} r={2} {...stroke} />
          <Circle cx={10} cy={17} r={2} {...stroke} />
        </>
      )}
      {name === 'server' && (
        <>
          <Rect x={3} y={4} width={18} height={7} rx={2} {...stroke} />
          <Rect x={3} y={13} width={18} height={7} rx={2} {...stroke} />
          <Path d="M7 7.5h.01M7 16.5h.01" {...stroke} />
        </>
      )}
      {name === 'trash' && (
        <>
          <Path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3" {...stroke} />
          <Path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...stroke} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 7v5l3 2" {...stroke} />
        </>
      )}
    </Svg>
  );
}
