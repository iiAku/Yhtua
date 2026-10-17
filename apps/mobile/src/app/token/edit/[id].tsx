import { base32SecretSchema, tokenLabelSchema } from '@yhtua/domain'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { editToken } from '../../../state/token-commands'
import { useVault } from '../../../state/vault-store'
import { Avatar, Button, Field, Notice, Screen } from '../../../ui/components'
import { ui } from '../../../ui/theme'

export default function EditToken() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const token = useVault((state) => state.tokens.find((candidate) => candidate.id === id))
  const [label, setLabel] = useState(token?.otp.label ?? '')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  if (!token)
    return (
      <Screen>
        <Notice danger>This token no longer exists.</Notice>
        <Button title="Back to vault" onPress={() => router.replace('/')} />
      </Screen>
    )

  const save = async () => {
    setError(null)
    const parsedLabel = tokenLabelSchema.safeParse(label)
    if (!parsedLabel.success) {
      setError(parsedLabel.error.issues[0]?.message ?? 'Invalid name')
      return
    }
    const parsedSecret = secret.length > 0 ? base32SecretSchema.safeParse(secret) : null
    if (parsedSecret && !parsedSecret.success) {
      setError(parsedSecret.error.issues[0]?.message ?? 'Invalid setup key')
      return
    }
    setSaving(true)
    const result = await editToken(token.id, {
      label: parsedLabel.data,
      secret: parsedSecret ? parsedSecret.data : undefined,
    })
    setSaving(false)
    if (result.ok) {
      setSecret('')
      router.back()
      return
    }
    setError(result.message)
  }
  return (
    <Screen>
      <View style={ui.row}>
        <Avatar label={token.otp.label} size={52} />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={ui.heading}>{token.otp.label}</Text>
          <Text style={ui.hint}>
            {token.otp.digits}-digit · {token.otp.period}s · {token.otp.algorithm}
          </Text>
        </View>
      </View>
      <View style={ui.card}>
        <Field
          label="Account name"
          value={label}
          onChangeText={setLabel}
          autoCapitalize="none"
          maxLength={256}
          editable={!saving}
        />
        <Field
          label="Replace setup key (optional)"
          value={secret}
          onChangeText={setSecret}
          placeholder="Leave empty to keep your key"
          autoCapitalize="characters"
          secureTextEntry
          maxLength={4096}
          editable={!saving}
          hint="Your existing key stays hidden. Enter a new one only if your service has changed it."
        />
      </View>
      {error ? <Notice danger>{error}</Notice> : null}
      <Button
        title={saving ? 'Saving…' : 'Save changes'}
        busy={saving}
        onPress={() => void save()}
      />
    </Screen>
  )
}
