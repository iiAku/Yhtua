import { getAvatarPlaceholder, getRemainingTime, type Token } from '@yhtua/domain'
import { Link } from 'expo-router'
import * as OTPAuth from 'otpauth'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { getDecryptedSecret } from '../state/secret-cache'
import { useVault } from '../state/vault-store'

const codeFor = async (token: Token): Promise<string> => {
  const secret = token.otp.encrypted ? await getDecryptedSecret(token.otp.secret) : token.otp.secret
  const totp = new OTPAuth.TOTP({
    issuer: token.otp.issuer,
    label: token.otp.label,
    algorithm: token.otp.algorithm,
    digits: token.otp.digits,
    period: token.otp.period,
    secret: OTPAuth.Secret.fromBase32(secret.toUpperCase()),
  })
  return totp.generate()
}

const TokenRow = ({ token }: { token: Token }) => {
  const [code, setCode] = useState('••••••')
  const [remaining, setRemaining] = useState(getRemainingTime(token.otp.period))

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void codeFor(token)
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
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getAvatarPlaceholder(token.otp.label)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.label}>{token.otp.label}</Text>
        <Text style={styles.code}>{code.replace(/(\d{3})(?=\d)/g, '$1 ')}</Text>
      </View>
      <Text style={[styles.remaining, remaining <= 5 && styles.remainingLow]}>{remaining}</Text>
    </View>
  )
}

export default function TokenList() {
  const tokens = useVault((state) => state.tokens)

  return (
    <View style={styles.screen}>
      {tokens.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No tokens yet</Text>
          <Text style={styles.emptyText}>Add your first authenticator token to get started.</Text>
        </View>
      ) : (
        <FlatList
          data={tokens}
          keyExtractor={(token) => token.id}
          renderItem={({ item }) => <TokenRow token={item} />}
          contentContainerStyle={styles.list}
        />
      )}
      <View style={styles.actions}>
        <Link href="/token/new" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryText}>Add token</Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryText}>Settings</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#15151B',
    borderWidth: 1,
    borderColor: '#23232B',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D1D25',
  },
  avatarText: { color: '#D4AF55', fontWeight: '700' },
  rowBody: { flex: 1, gap: 2 },
  label: { color: '#8A8578', fontSize: 12 },
  code: { color: '#E8E4D8', fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '600' },
  remaining: { color: '#8A8578', fontVariant: ['tabular-nums'], fontSize: 14, width: 24 },
  remainingLow: { color: '#E5484D' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyTitle: { color: '#E8E4D8', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#8A8578', fontSize: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, padding: 16 },
  primary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#D4AF55',
  },
  primaryText: { color: '#0B0B0F', fontWeight: '600' },
  secondary: {
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#23232B',
  },
  secondaryText: { color: '#8A8578', fontWeight: '500' },
})
