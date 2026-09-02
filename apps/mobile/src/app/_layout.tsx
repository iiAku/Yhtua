import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  acknowledgeSafeFrame,
  getLockState,
  requestUnlock,
  startLockHost,
  subscribeLockState,
} from '../lock/host'

// The mobile client enforces the shared lock machine: nothing renders behind
// the gate until the machine says `unlocked` (or `uninitialized`, where the
// onboarding flow creates the vault).

const GATE_OPEN = new Set(['unlocked', 'uninitialized'])

export default function RootLayout() {
  const [lockState, setLockState] = useState(getLockState())

  useEffect(() => {
    const unsubscribe = subscribeLockState(setLockState)
    void startLockHost()
    return unsubscribe
  }, [])

  // After a real backgrounding the native cover stays up until this runs, so
  // the first frame the user sees on resume is one this layout has already
  // decided — the lock gate, not the vault it was showing when it left.
  // Deliberately no dependency array: every committed render re-acknowledges.
  useEffect(() => {
    const frame = requestAnimationFrame(() => void acknowledgeSafeFrame())
    return () => cancelAnimationFrame(frame)
  })

  if (!GATE_OPEN.has(lockState)) {
    return (
      <View style={styles.gate}>
        <StatusBar style="light" />
        <Text style={styles.title}>Yhtua</Text>
        {lockState === 'hydrating' ? (
          <Text style={styles.subtitle}>Loading…</Text>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {lockState === 'unlocking' ? 'Confirm to unlock' : 'Locked'}
            </Text>
            <Pressable style={styles.unlock} onPress={() => void requestUnlock()}>
              <Text style={styles.unlockText}>Unlock</Text>
            </Pressable>
          </>
        )}
      </View>
    )
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B0B0F' },
          headerTintColor: '#E8E4D8',
          contentStyle: { backgroundColor: '#0B0B0F' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Tokens' }} />
        <Stack.Screen name="token/new" options={{ title: 'Add token' }} />
        <Stack.Screen name="token/scan" options={{ title: 'Scan QR code' }} />
        <Stack.Screen name="token/[id]" options={{ title: 'Token' }} />
        <Stack.Screen name="token/edit/[id]" options={{ title: 'Edit token' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/transfer" options={{ title: 'Backups' }} />
      </Stack>
    </>
  )
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0F',
    gap: 12,
  },
  title: { color: '#E8E4D8', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#8A8578', fontSize: 15 },
  unlock: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#D4AF55',
  },
  unlockText: { color: '#0B0B0F', fontWeight: '600', fontSize: 15 },
})
