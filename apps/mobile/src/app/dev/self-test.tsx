import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'

// Debug-only device self-test screen (sub-gate 6b hard gate): runs every
// golden vector through the REAL native module path on a physical iPhone,
// including the access-control-bound Keychain round trip (raises Face ID).
// Release builds render a refusal; the native side refuses independently.

export default function SelfTestScreen() {
  const [report, setReport] = useState<string>('Not run yet')
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    try {
      if (!__DEV__) {
        setReport('Self-test is a debug-only feature')
        return
      }
      const { isNativeVaultAvailable, runNativeSelfTest } =
        await import('../../../modules/yhtua-vault')
      if (!isNativeVaultAvailable()) {
        setReport('Native vault module is not in this build (Expo Go?) — use a dev build')
        return
      }
      const fixture = require('../../../../../test/fixtures/crypto-vectors.json') as unknown
      setReport(await runNativeSelfTest(JSON.stringify(fixture)))
    } catch (error) {
      setReport(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Vault self-test</Text>
      <Text style={styles.text}>
        Runs the byte-exact golden vectors through Swift → Rust on this device, then a Keychain
        round trip behind the biometric prompt. Debug builds only.
      </Text>
      <Pressable style={styles.button} onPress={() => void run()} disabled={running}>
        <Text style={styles.buttonText}>{running ? 'Running…' : 'Run self-test'}</Text>
      </Pressable>
      <Text style={[styles.report, report.startsWith('OK') && styles.reportOk]}>{report}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { padding: 16, gap: 12 },
  title: { color: '#E8E4D8', fontSize: 18, fontWeight: '700' },
  text: { color: '#8A8578', fontSize: 13, lineHeight: 18 },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#D4AF55',
  },
  buttonText: { color: '#0B0B0F', fontWeight: '600' },
  report: { color: '#E5484D', fontFamily: 'Menlo', fontSize: 12, marginTop: 8 },
  reportOk: { color: '#3DD68C' },
})
