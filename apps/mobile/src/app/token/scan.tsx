import { CameraView, useCameraPermissions } from 'expo-camera'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { parseOtpauthUri } from '../../otpauth-uri'
import { createToken } from '../../state/token-commands'
import { Button, Notice, Screen } from '../../ui/components'
import { colors, ui } from '../../ui/theme'

export default function ScanToken() {
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const handling = useRef(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )
  const onScanned = async (data: string) => {
    if (handling.current) return
    handling.current = true
    setError(null)
    const scanned = parseOtpauthUri(data)
    if (!scanned) {
      setError(
        'This is not a supported authenticator QR code. Use the code shown in your service’s two-factor setup.',
      )
      // Wait for an explicit retry; repeated camera events must not continually announce errors.
      return
    }
    setSaving(true)
    const result = await createToken(scanned)
    setSaving(false)
    if (result.ok) {
      router.dismissTo('/')
      return
    }
    setError(result.message)
  }
  if (!permission || !permission.granted)
    return (
      <Screen>
        <Text style={ui.eyebrow}>ADD WITH YOUR CAMERA</Text>
        <Text style={ui.title}>Scan. Secure. Done.</Text>
        <Text style={ui.body}>
          Point your camera at the QR code shown when you enable two-factor authentication. Nothing
          is recorded or sent anywhere.
        </Text>
        {permission ? (
          <Button
            title={permission.canAskAgain ? 'Allow camera access' : 'Open camera settings'}
            icon="scan"
            onPress={() => {
              void (permission.canAskAgain ? requestPermission() : Linking.openSettings()).catch(
                () => setError('Could not open camera settings. You can enter the key manually.'),
              )
            }}
          />
        ) : null}
        <Button
          title="Enter a setup key instead"
          variant="secondary"
          icon="key"
          onPress={() => router.replace('/token/new')}
        />
        {error ? <Notice danger>{error}</Notice> : null}
      </Screen>
    )
  return (
    <View style={ui.screen}>
      {focused ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void onScanned(data)}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '20%',
          left: '15%',
          right: '15%',
          height: 240,
          borderRadius: 24,
          borderWidth: 2,
          borderColor: colors.accent,
        }}
      />
      <View style={{ padding: 24, gap: 14 }}>
        <Text style={[ui.body, { textAlign: 'center' }]}>
          {saving ? 'Encrypting your token…' : 'Place your authenticator QR code inside the frame.'}
        </Text>
        {error ? (
          <>
            <Notice danger>{error}</Notice>
            <Button
              title="Scan again"
              variant="secondary"
              onPress={() => {
                handling.current = false
                setError(null)
              }}
            />
          </>
        ) : null}
        <Button
          title="Enter key manually"
          variant="secondary"
          disabled={saving}
          onPress={() => router.replace('/token/new')}
        />
      </View>
    </View>
  )
}
