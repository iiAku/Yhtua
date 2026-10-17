import Svg, { Path, Rect, Circle } from 'react-native-svg'
import { colors } from './theme'

export type IconName =
  | 'lock'
  | 'plus'
  | 'search'
  | 'settings'
  | 'cloud'
  | 'scan'
  | 'chevron'
  | 'copy'
  | 'check'
  | 'key'
  | 'download'
  | 'upload'
  | 'shield'
  | 'close'
  | 'edit'
const paths: Partial<Record<IconName, string>> = {
  plus: 'M12 5v14M5 12h14',
  search: 'm21 21-4.5-4.5',
  chevron: 'm9 5 7 7-7 7',
  copy: 'M8 8V4h12v12h-4M4 8h12v12H4z',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  key: 'M15 7a5 5 0 1 0-4 8l3 3h3v3h4v-4l-6-6',
  download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  upload: 'M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5',
  cloud: 'M7 19a5 5 0 0 1-1-10 6 6 0 0 1 11-2 4 4 0 0 1 1 12H7Z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  scan: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M7 7h3v3H7zm7 0h3v3h-3zM7 14h3v3H7zm7 0h3v3h-3z',
  edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5',
  settings: 'm9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3H9Z',
}
export function Icon({
  name,
  size = 22,
  color = colors.secondary,
}: {
  name: IconName
  size?: number
  color?: string
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      {name === 'lock' ? (
        <>
          <Rect x={5} y={10} width={14} height={11} rx={3} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
        </>
      ) : (
        <Path d={paths[name]} />
      )}
      {name === 'search' ? <Circle cx={10.5} cy={10.5} r={6.5} /> : null}
      {name === 'settings' ? <Circle cx={12} cy={12} r={3} /> : null}
    </Svg>
  )
}
