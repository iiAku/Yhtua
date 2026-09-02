import { base32SecretSchema, tokenLabelSchema } from '@yhtua/domain'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { getCryptoPort } from '../../../ports'
import { updateToken, useVault } from '../../../state/vault-store'

// Editing is rename plus OPTIONAL secret replacement. The stored secret is
// never decrypted for display: replacing it means typing a new one, which
// keeps this screen free of any plaintext it did not receive from the user.

export default function EditToken() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const token = useVault((state) => state.tokens.find((candidate) => candidate.id === id))
  const [label, setLabel] = useState(token?.otp.label ?? '')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!token) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>This token no longer exists.</Text>
      </View>
    )
  }

  const save = async () => {
    setError(null)
    // Label and secret are validated by the same rules that guard creation,
    // but independently: an edit that keeps the secret must not have to
    // re-supply one.
    const parsedLabel = tokenLabelSchema.safeParse(label)
    if (!parsedLabel.success) {
      setError(parsedLabel.error.issues[0]?.message ?? 'Invalid label')
      return
    }
    const parsedSecret = secret.length > 0 ? base32SecretSchema.safeParse(secret) : null
    if (parsedSecret && !parsedSecret.success) {
      setError(parsedSecret.error.issues[0]?.message ?? 'Invalid secret')
      return
    }
    setSaving(true)
    try {
      const ciphertext = parsedSecret
        ? await getCryptoPort().encryptSecret(parsedSecret.data)
        : undefined
      if (!updateToken(token.id, { label: parsedLabel.data, secret: ciphertext })) {
        setError('The token could not be updated')
        return
      }
      router.back()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Encryption failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.fieldLabel}>Label</Text>
      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        placeholder="alice@example.com"
        placeholderTextColor="#55524A"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.fieldLabel}>Replace secret (optional)</Text>
      <TextInput
        style={styles.input}
        value={secret}
        onChangeText={setSecret}
        placeholder="Leave empty to keep the current secret"
        placeholderTextColor="#55524A"
        autoCapitalize="characters"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={styles.hint}>
        The stored secret is never shown. Replacing it re-encrypts the new value on this device.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.primary, saving && styles.disabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F', padding: 16, gap: 8 },
  fieldLabel: { color: '#8A8578', fontSize: 13, marginTop: 8 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#23232B',
    backgroundColor: '#15151B',
    color: '#E8E4D8',
    padding: 12,
    fontSize: 16,
  },
  hint: { color: '#55524A', fontSize: 12, lineHeight: 17 },
  error: { color: '#E5484D', fontSize: 13, marginTop: 4 },
  primary: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#D4AF55',
  },
  primaryText: { color: '#0B0B0F', fontWeight: '600' },
  disabled: { opacity: 0.6 },
})
