import type { PropsWithChildren } from 'react'
import { getAvatarPlaceholder, hashLabel } from '@yhtua/domain'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, type IconName } from './icon'
import { colors, ui } from './theme'

export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView
      style={ui.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 56}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[ui.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  title: string
  onPress: () => void
  icon?: IconName
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  busy?: boolean
}) {
  const tint =
    variant === 'primary' ? colors.base : variant === 'danger' ? colors.danger : colors.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary'
          ? styles.primary
          : variant === 'danger'
            ? styles.danger
            : styles.secondary,
        (pressed || disabled || busy) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tint} />
      ) : icon ? (
        <Icon name={icon} color={tint} size={19} />
      ) : null}
      <Text style={[styles.buttonText, { color: tint }]}>{title}</Text>
    </Pressable>
  )
}
export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        autoCorrect={false}
        style={ui.input}
        {...props}
      />
      {hint ? <Text style={ui.hint}>{hint}</Text> : null}
    </View>
  )
}
const palette = [
  '#a78bfa',
  '#38bdf8',
  '#34d399',
  '#fb7185',
  '#fbbf24',
  '#22d3ee',
  '#e879f9',
  '#2dd4bf',
]
export function Avatar({ label, size = 44 }: { label: string; size?: number }) {
  const tint = palette[hashLabel(label, palette.length)] ?? colors.accent
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${tint}18`,
        borderWidth: 1,
        borderColor: `${tint}26`,
      }}
    >
      <Text style={{ color: tint, fontSize: size * 0.29, fontWeight: '600' }}>
        {getAvatarPlaceholder(label)}
      </Text>
    </View>
  )
}
export function Notice({ children, danger = false }: PropsWithChildren<{ danger?: boolean }>) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, danger && { backgroundColor: colors.dangerSubtle }]}
    >
      <Text style={[ui.body, { color: danger ? colors.danger : colors.accent }]}>{children}</Text>
    </View>
  )
}
const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.elevated, borderColor: colors.border },
  danger: { backgroundColor: colors.dangerSubtle, borderColor: 'rgba(239,68,68,0.2)' },
  buttonText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  notice: { backgroundColor: colors.accentSubtle, borderRadius: 12, padding: 14 },
})
