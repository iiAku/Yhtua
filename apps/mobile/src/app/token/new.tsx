import { addTokenSchema, DEFAULT_PERIOD } from '@yhtua/domain'
import { router } from 'expo-router'
import { randomUUID } from 'expo-crypto'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { dispatch, getLockState } from '../../lock/host'
import { getCryptoPort } from '../../ports'
import { addToken } from '../../state/vault-store'

export default function NewToken() {
  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setError(null)
    const parsed = addTokenSchema.safeParse({ secret, label, digits: 6 })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    setSaving(true)
    try {
      const crypto = getCryptoPort()
      await crypto.ensureEncryptionKey()
      // The secret is encrypted IMMEDIATELY; plaintext never reaches state.
      const ciphertext = await crypto.encryptSecret(parsed.data.secret)
      const added = addToken({
        id: randomUUID(),
        updatedAt: Date.now(),
        otp: {
          issuer: '',
          label: parsed.data.label,
          algorithm: 'SHA1',
          digits: parsed.data.digits,
          period: DEFAULT_PERIOD,
          secret: ciphertext,
          encrypted: true,
        },
      })
      if (!added) {
        setError('A token with this identity already exists')
        return
      }
      // First token: the vault now exists — tell the lock machine so
      // background/idle locking engages. If the process dies before the
      // persist write lands, the next hydration recovers the true state.
      if (getLockState() === 'uninitialized') {
        dispatch({ type: 'VAULT_CREATED' })
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
      <Text style={styles.fieldLabel}>Secret (Base32)</Text>
      <TextInput
        style={styles.input}
        value={secret}
        onChangeText={setSecret}
        placeholder="JBSW Y3DP EHPK 3PXP"
        placeholderTextColor="#55524A"
        autoCapitalize="characters"
        autoCorrect={false}
        secureTextEntry
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.primary, saving && styles.disabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.primaryText}>{saving ? 'Encrypting…' : 'Add token'}</Text>
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
