import { addTokenSchema, DEFAULT_PERIOD } from '@yhtua/domain'
import { Link, router } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { createToken } from '../../state/token-commands'

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
    // createToken owns encryption, the at-rest invariant and the commit-time
    // lock check; this screen owns only the form.
    const result = await createToken({
      issuer: '',
      label: parsed.data.label,
      algorithm: 'SHA1',
      digits: parsed.data.digits,
      period: DEFAULT_PERIOD,
      secret: parsed.data.secret,
    })
    setSaving(false)
    if (result.ok) {
      router.back()
      return
    }
    setError(result.message)
  }

  return (
    <View style={styles.screen}>
      <Link href="/token/scan" asChild>
        <Pressable style={styles.scan}>
          <Text style={styles.scanText}>Scan a QR code instead</Text>
        </Pressable>
      </Link>
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
  scan: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#23232B',
  },
  scanText: { color: '#8A8578', fontWeight: '500' },
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
