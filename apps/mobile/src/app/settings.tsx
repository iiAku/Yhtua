import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { dispatch } from '../lock/host'
import { getCryptoPort } from '../ports'
import { destroyVaultStorage, useVault } from '../state/vault-store'

export default function Settings() {
  const tokenCount = useVault((state) => state.tokens.length)
  const [confirming, setConfirming] = useState(false)

  const destroyVault = async () => {
    // Order matters: durable storage deletion and a fresh key FIRST, the
    // machine notification (which wipes caches) only after both stuck.
    await destroyVaultStorage()
    try {
      await getCryptoPort().resetEncryptionKey()
    } catch {
      // A failed key reset leaves a fresh empty vault with the old key —
      // safe either way since no ciphertext remains.
    }
    dispatch({ type: 'VAULT_DESTROYED' })
    setConfirming(false)
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vault</Text>
        <Text style={styles.cardText}>{tokenCount} token(s), encrypted at rest.</Text>
        <Text style={styles.cardText}>
          Import/export (YHP2) and biometric unlock arrive with the native vault module.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Danger zone</Text>
        {confirming ? (
          <View style={styles.rowGap}>
            <Text style={styles.cardText}>
              This permanently deletes every token on this device.
            </Text>
            <View style={styles.row}>
              <Pressable style={styles.danger} onPress={() => void destroyVault()}>
                <Text style={styles.dangerText}>Delete everything</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setConfirming(false)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.secondary} onPress={() => setConfirming(true)}>
            <Text style={styles.dangerText}>Destroy vault…</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F', padding: 16, gap: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#23232B',
    backgroundColor: '#15151B',
    padding: 16,
    gap: 6,
  },
  cardTitle: { color: '#E8E4D8', fontSize: 15, fontWeight: '600' },
  cardText: { color: '#8A8578', fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10 },
  rowGap: { gap: 10 },
  danger: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(229,72,77,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,72,77,0.3)',
  },
  dangerText: { color: '#E5484D', fontWeight: '600', fontSize: 13 },
  secondary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#23232B',
    alignSelf: 'flex-start',
  },
  secondaryText: { color: '#8A8578', fontWeight: '500', fontSize: 13 },
})
