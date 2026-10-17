import type { Token } from '@yhtua/domain'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { copyCode, isClipboardAvailable } from '../../clipboard'
import { formatCode, generateCode, useTotpCode } from '../../totp'
import { deleteToken, useVault } from '../../state/vault-store'
import { Avatar, Button, Notice, Screen } from '../../ui/components'
import { colors, mono, ui } from '../../ui/theme'

export default function TokenDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const token = useVault((state) => state.tokens.find((candidate) => candidate.id === id))
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!token) router.replace('/')
  }, [token])
  if (!token) return <View style={ui.screen} />
  return (
    <Screen>
      <CodePanel token={token} />
      <View style={ui.card}>
        <Text style={ui.eyebrow}>TOKEN DETAILS</Text>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={ui.body}>Code length</Text>
          <Text style={ui.label}>{token.otp.digits} digits</Text>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={ui.body}>Refresh interval</Text>
          <Text style={ui.label}>{token.otp.period} seconds</Text>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={ui.body}>Algorithm</Text>
          <Text style={ui.label}>{token.otp.algorithm}</Text>
        </View>
        <Button
          title="Edit token"
          icon="edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/token/edit/[id]', params: { id: token.id } })}
        />
      </View>
      {confirming ? (
        <View style={ui.card}>
          <Notice danger>
            Delete {token.otp.label} from this device? Keep another way to sign in to your account.
            Deletion is also recorded for future backup merges.
          </Notice>
          <Button
            title="Delete token permanently"
            variant="danger"
            onPress={() => {
              deleteToken(token.id)
              setConfirming(false)
            }}
          />
          <Button title="Keep token" variant="secondary" onPress={() => setConfirming(false)} />
        </View>
      ) : (
        <Button title="Delete token…" variant="danger" onPress={() => setConfirming(true)} />
      )}
    </Screen>
  )
}

function CodePanel({ token }: { token: Token }) {
  const { code, remaining, error, retry } = useTotpCode(token)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const low = remaining <= 5
  const circumference = 2 * Math.PI * 50
  const tint = low ? colors.danger : colors.accent
  useEffect(() => {
    setCopyStatus(null)
  }, [code])
  const copy = async () => {
    if (copying) return
    setCopying(true)
    try {
      const fresh = await generateCode(token)
      setCopyStatus(
        (await copyCode(fresh)) ? 'Copied. Clears in 30 seconds.' : 'Could not copy. Try again.',
      )
    } catch {
      setCopyStatus('Could not copy. Try again.')
    } finally {
      setCopying(false)
    }
  }
  return (
    <View style={{ alignItems: 'center', gap: 16, paddingVertical: 24 }}>
      <View style={{ width: 116, height: 116, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={116}
          height={116}
          viewBox="0 0 116 116"
          style={{ position: 'absolute' }}
          aria-hidden={true}
        >
          <Circle cx={58} cy={58} r={50} stroke={colors.elevated} strokeWidth={3} fill="none" />
          <Circle
            cx={58}
            cy={58}
            r={50}
            stroke={tint}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - remaining / token.otp.period)}
            strokeLinecap="round"
            transform="rotate(-90 58 58)"
          />
        </Svg>
        <Avatar label={token.otp.label} size={76} />
      </View>
      <Text style={[ui.heading, { fontSize: 22, textAlign: 'center' }]}>{token.otp.label}</Text>
      {token.otp.issuer ? <Text style={ui.body}>{token.otp.issuer}</Text> : null}
      <Text style={[ui.eyebrow, { color: colors.muted, marginTop: 12 }]}>VERIFICATION CODE</Text>
      <Text
        accessibilityLabel={
          code ? `Verification code ${code.split('').join(' ')}` : 'Code unavailable'
        }
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          width: '100%',
          textAlign: 'center',
          color: colors.text,
          fontFamily: mono,
          fontSize: token.otp.digits === 8 ? 38 : 44,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          letterSpacing: 3,
        }}
      >
        {formatCode(code)}
      </Text>
      <Text style={[ui.hint, { color: tint }]}>{remaining}s until the next code</Text>
      {error ? (
        <View style={{ width: '100%', gap: 12 }}>
          <Notice danger>{error}</Notice>
          <Button title="Try generating code again" variant="secondary" onPress={retry} />
        </View>
      ) : null}
      <View style={{ width: '100%', marginTop: 8 }}>
        <Button
          title={copyStatus?.startsWith('Copied') ? 'Copied' : 'Copy code'}
          icon={copyStatus?.startsWith('Copied') ? 'check' : 'copy'}
          disabled={code === null || !isClipboardAvailable()}
          busy={copying}
          onPress={() => void copy()}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={[ui.hint, { textAlign: 'center' }]}>
        {copyStatus ??
          (isClipboardAvailable()
            ? 'Device-only clipboard · automatically cleared'
            : 'Copy is available in the installed iPhone app.')}
      </Text>
    </View>
  )
}
