// Matches app/assets/css/main.css. Keep the native surfaces and desktop vault in step.
import { Platform, StyleSheet } from 'react-native'

export const colors = {
  base: '#0a0b10',
  surface: '#111318',
  elevated: '#181b24',
  input: '#0e0f15',
  border: 'rgba(255,255,255,0.06)',
  borderActive: 'rgba(212,175,85,0.3)',
  text: '#e2e4e9',
  secondary: '#969bb0',
  muted: '#7a7f95',
  accent: '#d4af55',
  accentSubtle: 'rgba(212,175,85,0.08)',
  success: '#4ade80',
  danger: '#ef4444',
  dangerSubtle: 'rgba(239,68,68,0.1)',
} as const
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.base },
  content: { padding: 24, gap: 20, width: '100%', maxWidth: 600, alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '600' },
  body: { color: colors.secondary, fontSize: 14, lineHeight: 22 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  label: { color: colors.secondary, fontSize: 13, fontWeight: '500' },
  input: {
    minHeight: 52,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
})
