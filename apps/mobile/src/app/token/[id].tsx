import { getAvatarPlaceholder, getRemainingTime, type Token } from '@yhtua/domain'
import { Link, router, useLocalSearchParams } from 'expo-router'
import * as OTPAuth from 'otpauth'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { copyCode, isClipboardAvailable } from '../../clipboard'
import { getDecryptedSecret } from '../../state/secret-cache'
import { deleteToken, useVault } from '../../state/vault-store'

// Token detail: the full-size code, and the only place a token can be edited
// or deleted. The plaintext secret is NEVER rendered here — unlike desktop,
// where a reveal control is defensible behind a window; a phone screen is
// shoulder-surfed and screenshotted, so the secret only ever exists inside
// the transient cache that produces the code.

export default function TokenDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const token = useVault((state) => state.tokens.find((candidate) => candidate.id === id))
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    // The token can vanish under us (deletion, a backup import, a vault
    // destroy from settings): leave rather than render a stale code.
    if (!token) router.back()
  }, [token])

  if (!token) return <View style={styles.screen} />

  return (
    <View style={styles.screen}>
      <CodePanel token={token} />
      <View style={styles.actions}>
        <Link href={{ pathname: '/token/edit/[id]', params: { id: token.id } }} asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryText}>Edit</Text>
          </Pressable>
        </Link>
        {confirming ? (
          <>
            <Pressable
              style={styles.danger}
              onPress={() => {
                deleteToken(token.id)
                setConfirming(false)
              }}
            >
              <Text style={styles.dangerText}>Delete for good</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setConfirming(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.secondary} onPress={() => setConfirming(true)}>
            <Text style={styles.dangerText}>Delete</Text>
          </Pressable>
        )}
      </View>
      {confirming ? (
        <Text style={styles.warning}>
          Deleting removes this token from this device and records a tombstone, so a later backup
          import cannot bring it back.
        </Text>
      ) : null}
    </View>
  )
}

const CodePanel = ({ token }: { token: Token }) => {
  const [code, setCode] = useState('••••••')
  const [remaining, setRemaining] = useState(getRemainingTime(token.otp.period))
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void generateCode(token)
        .then((value) => {
          if (!cancelled) setCode(value)
        })
        .catch(() => {
          if (!cancelled) setCode('••••••')
        })
    }
    refresh()
    const interval = setInterval(() => {
      const left = getRemainingTime(token.otp.period)
      setRemaining(left)
      if (left === token.otp.period) refresh()
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  return (
    <View style={styles.panel}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getAvatarPlaceholder(token.otp.label)}</Text>
      </View>
      <Text style={styles.label}>{token.otp.label}</Text>
      {token.otp.issuer ? <Text style={styles.issuer}>{token.otp.issuer}</Text> : null}
      <Text style={styles.code}>{code.replace(/(\d{3})(?=\d)/g, '$1 ')}</Text>
      <Text style={[styles.remaining, remaining <= 5 && styles.remainingLow]}>
        {remaining}s remaining
      </Text>
      <Pressable
        style={[styles.copy, !isClipboardAvailable() && styles.disabled]}
        disabled={!isClipboardAvailable()}
        onPress={() => {
          void copyCode(code).then((copied) =>
            setCopyStatus(copied ? 'Copied — clears in 30s' : 'Copy failed'),
          )
        }}
      >
        <Text style={styles.copyText}>Copy code</Text>
      </Pressable>
      <Text style={styles.copyStatus}>
        {isClipboardAvailable()
          ? (copyStatus ?? 'Stays on this device and clears itself')
          : 'Copying needs the full app build'}
      </Text>
    </View>
  )
}

const generateCode = async (token: Token): Promise<string> => {
  const secret = token.otp.encrypted ? await getDecryptedSecret(token.otp.secret) : token.otp.secret
  return new OTPAuth.TOTP({
    issuer: token.otp.issuer,
    label: token.otp.label,
    algorithm: token.otp.algorithm,
    digits: token.otp.digits,
    period: token.otp.period,
    secret: OTPAuth.Secret.fromBase32(secret.toUpperCase()),
  }).generate()
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F', padding: 16, gap: 16 },
  panel: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 32,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#23232B',
    backgroundColor: '#15151B',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#23232B',
    marginBottom: 6,
  },
  avatarText: { color: '#D4AF55', fontSize: 20, fontWeight: '700' },
  label: { color: '#E8E4D8', fontSize: 17, fontWeight: '600' },
  issuer: { color: '#8A8578', fontSize: 13 },
  code: {
    color: '#D4AF55',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  remaining: { color: '#8A8578', fontSize: 13 },
  remainingLow: { color: '#E5484D' },
  copy: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#D4AF55',
  },
  copyText: { color: '#0B0B0F', fontWeight: '600' },
  copyStatus: { color: '#55524A', fontSize: 12 },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  secondary: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#23232B',
  },
  secondaryText: { color: '#8A8578', fontWeight: '500', fontSize: 13 },
  danger: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(229,72,77,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,72,77,0.3)',
  },
  dangerText: { color: '#E5484D', fontWeight: '600', fontSize: 13 },
  warning: { color: '#8A8578', fontSize: 12, lineHeight: 17 },
})
