import { base32SecretSchema, otpParametersSchema } from '@yhtua/domain'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { createToken } from '../../state/token-commands'
import { Button, Field, Notice, Screen } from '../../ui/components'
import { colors, ui } from '../../ui/theme'

export default function NewToken() {
  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [issuer, setIssuer] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [algorithm, setAlgorithm] = useState('SHA1')
  const [digits, setDigits] = useState('6')
  const [period, setPeriod] = useState('30')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setError(null)
    const parsedSecret = base32SecretSchema.safeParse(secret)
    if (!parsedSecret.success) {
      setError(parsedSecret.error.issues[0]?.message ?? 'Invalid setup key')
      return
    }
    const parsed = otpParametersSchema.safeParse({
      label,
      issuer,
      secret: parsedSecret.data,
      algorithm,
      digits: Number(digits),
      period: Number(period),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid token')
      return
    }
    setSaving(true)
    const result = await createToken(parsed.data)
    setSaving(false)
    if (result.ok) {
      setSecret('')
      router.dismissTo('/')
      return
    }
    setError(result.message)
  }

  return (
    <Screen>
      <Text style={ui.eyebrow}>ADD AN ACCOUNT</Text>
      <Text style={ui.title}>A safer sign-in.</Text>
      <Text style={ui.body}>Scan the QR code from your service, or enter its setup key below.</Text>
      <Button
        title="Scan a QR code"
        icon="scan"
        variant="secondary"
        onPress={() => router.push('/token/scan')}
      />
      <View style={ui.card}>
        <Text style={ui.heading}>Enter manually</Text>
        <Field
          label="Account name"
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Personal email"
          autoCapitalize="none"
          maxLength={256}
          editable={!saving}
        />
        <Field
          label="Service (optional)"
          value={issuer}
          onChangeText={setIssuer}
          placeholder="e.g. Google"
          maxLength={256}
          editable={!saving}
        />
        <Field
          label="Setup key"
          value={secret}
          onChangeText={setSecret}
          placeholder="Your Base32 secret"
          autoCapitalize="characters"
          secureTextEntry
          maxLength={4096}
          editable={!saving}
          hint="Use the key provided when you enable two-factor authentication."
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => setAdvanced(!advanced)}
        >
          <Text style={{ color: colors.accent, fontSize: 13 }}>
            {advanced ? 'Hide advanced options' : 'Advanced options'}
          </Text>
        </Pressable>
        {advanced ? (
          <View style={{ gap: 16 }}>
            <Text style={ui.hint}>
              Only change these if your service specifies different values.
            </Text>
            <Text style={ui.label}>Algorithm</Text>
            <View style={[ui.row, { flexWrap: 'wrap' }]}>
              {['SHA1', 'SHA256', 'SHA512'].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: algorithm === value }}
                  onPress={() => setAlgorithm(value)}
                  style={{
                    padding: 13,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: algorithm === value ? colors.accent : colors.border,
                    backgroundColor: colors.input,
                  }}
                >
                  <Text style={{ color: algorithm === value ? colors.accent : colors.secondary }}>
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field
              label="Code digits (6–8)"
              value={digits}
              onChangeText={setDigits}
              keyboardType="number-pad"
              maxLength={1}
            />
            <Field
              label="Refresh interval in seconds (15–300)"
              value={period}
              onChangeText={setPeriod}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
        ) : null}
      </View>
      {error ? <Notice danger>{error}</Notice> : null}
      <Button
        title={saving ? 'Encrypting…' : 'Add token'}
        icon="plus"
        busy={saving}
        onPress={() => void save()}
      />
      <Text style={[ui.hint, { textAlign: 'center' }]}>
        Your setup key is encrypted on this device.
      </Text>
    </Screen>
  )
}
