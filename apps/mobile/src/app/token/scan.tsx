import { CameraView, useCameraPermissions } from 'expo-camera'
import { randomUUID } from 'expo-crypto'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { parseOtpauthUri } from '../../otpauth-uri'
import { getCryptoPort } from '../../ports'
import { dispatch, getLockState } from '../../lock/host'
import { addToken } from '../../state/vault-store'

// The scanned secret is encrypted and stored HERE rather than handed back to
// the entry form: a navigation parameter is state the router serializes and
// may persist, which is the last place a plaintext TOTP secret belongs.

export default function ScanToken() {
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState<string | null>(null)
  // A camera fires the same code many times a second; one scan may be handled.
  const handling = useRef(false)

  const onScanned = async (data: string) => {
    if (handling.current) return
    handling.current = true
    setError(null)
    try {
      const scanned = parseOtpauthUri(data)
      if (!scanned) {
        setError('That QR code is not an authenticator token Yhtua can store.')
        return
      }
      const crypto = getCryptoPort()
      await crypto.ensureEncryptionKey()
      const ciphertext = await crypto.encryptSecret(scanned.secret)
      const added = addToken({
        id: randomUUID(),
        updatedAt: Date.now(),
        otp: {
          issuer: scanned.issuer,
          label: scanned.label,
          algorithm: scanned.algorithm,
          digits: scanned.digits,
          period: scanned.period,
          secret: ciphertext,
          encrypted: true,
        },
      })
      if (!added) {
        setError('That token could not be added.')
        return
      }
      if (getLockState() === 'uninitialized') dispatch({ type: 'VAULT_CREATED' })
      router.back()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the scanned token')
    } finally {
      // Re-arm only on failure; a success has already navigated away.
      handling.current = false
    }
  }

  if (!permission) return <View style={styles.screen} />

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>
          Yhtua needs the camera to scan an authenticator QR code. Nothing is recorded and nothing
          leaves this device.
        </Text>
        <Pressable style={styles.primary} onPress={() => void requestPermission()}>
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void onScanned(data)}
      />
      <View style={styles.footer}>
        <Text style={styles.text}>Point the camera at the QR code your provider shows.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  centered: {
    flex: 1,
    backgroundColor: '#0B0B0F',
    padding: 24,
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: { flex: 1 },
  footer: { padding: 16, gap: 8 },
  text: { color: '#8A8578', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  error: { color: '#E5484D', fontSize: 13, textAlign: 'center' },
  primary: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#D4AF55',
  },
  primaryText: { color: '#0B0B0F', fontWeight: '600' },
})
