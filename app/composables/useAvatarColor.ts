import { hashLabel } from '@yhtua/domain'

const palette = [
  { bg: 'bg-violet-500/10 border-violet-500/15', text: 'text-violet-400' },
  { bg: 'bg-sky-500/10 border-sky-500/15', text: 'text-sky-400' },
  { bg: 'bg-emerald-500/10 border-emerald-500/15', text: 'text-emerald-400' },
  { bg: 'bg-rose-500/10 border-rose-500/15', text: 'text-rose-400' },
  { bg: 'bg-amber-500/10 border-amber-500/15', text: 'text-amber-400' },
  { bg: 'bg-cyan-500/10 border-cyan-500/15', text: 'text-cyan-400' },
  { bg: 'bg-fuchsia-500/10 border-fuchsia-500/15', text: 'text-fuchsia-400' },
  { bg: 'bg-teal-500/10 border-teal-500/15', text: 'text-teal-400' },
] as const

export const avatarBgClass = (label: string) =>
  palette[hashLabel(label, palette.length)]?.bg ?? palette[0].bg
export const avatarTextClass = (label: string) =>
  palette[hashLabel(label, palette.length)]?.text ?? palette[0].text
