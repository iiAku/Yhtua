import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Button, Notice, Screen } from '../ui/components'
import { Icon } from '../ui/icon'
import { colors, ui } from '../ui/theme'
import { isNativeVaultAvailable } from '../../modules/yhtua-vault'
import { destroyVaultStorage } from '../state/vault-store'
import { getCryptoPort } from '../ports'
import {
  beginSafeFrame,
  dispatch,
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
  return (
    <SafeAreaProvider>
      <VaultLayout />
    </SafeAreaProvider>
  )
}

function VaultLayout() {
  const [lockState, setLockState] = useState(getLockState())
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [resetting, setResetting] = useState(false)
  const unlock = async () => {
    setUnlockError(null)
    await requestUnlock()
    if (getLockState() !== 'unlocked')
      setUnlockError(
        'Unable to unlock. Try again with your enrolled biometrics, or use recovery below.',
      )
  }
  const reset = async () => {
    setResetting(true)
    try {
      await destroyVaultStorage()
      try {
        await getCryptoPort().resetEncryptionKey()
      } catch {
        /* No ciphertext remains. */
      }
      dispatch({ type: 'VAULT_DESTROYED' })
      setRecovery(false)
      setUnlockError(null)
    } catch {
      setUnlockError('Could not reset the local vault. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeLockState(setLockState)
    void startLockHost()
    return unsubscribe
  }, [])

  // After a real backgrounding the native cover stays up until this runs, so
  // the first frame the user sees on resume is one this layout has already
  // decided — the lock gate, not the vault it was showing when it left. The
  // cover generation is read HERE, during the commit, and acknowledged after
  // the frame is painted, so a backgrounding in between cannot be uncovered
  // by this render's acknowledgment. Deliberately no dependency array: every
  // committed render re-acknowledges, which is also the retry path.
  useEffect(() => {
    let cancelled = false
    let frame: number | undefined
    void beginSafeFrame().then((acknowledge) => {
      if (cancelled || !acknowledge) return
      frame = requestAnimationFrame(() => void acknowledge())
    })
    return () => {
      cancelled = true
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  })

  if (!GATE_OPEN.has(lockState)) {
    return (
      <Screen>
        <StatusBar style="light" />
        <View style={{ alignItems: 'center', paddingVertical: 60, gap: 20 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accentSubtle,
              borderColor: colors.borderActive,
              borderWidth: 1,
            }}
          >
            <Icon name="lock" color={colors.accent} size={36} />
          </View>
          <Text style={ui.title}>Yhtua</Text>
          <Text style={ui.eyebrow}>YOUR PRIVATE VAULT</Text>
          <Text style={[ui.body, { textAlign: 'center' }]}>
            {lockState === 'hydrating'
              ? 'Opening your encrypted vault…'
              : lockState === 'unlocking'
                ? 'Confirm with Face ID or Touch ID.'
                : 'Your tokens are safely locked. Unlock to continue.'}
          </Text>
        </View>
        {lockState !== 'hydrating' ? (
          <>
            <Button
              title={lockState === 'unlocking' ? 'Waiting for confirmation…' : 'Unlock vault'}
              icon="lock"
              busy={lockState === 'unlocking'}
              onPress={() => void unlock()}
            />
            {unlockError ? <Notice danger>{unlockError}</Notice> : null}
            <Button
              title={recovery ? 'Hide recovery options' : 'Can’t unlock?'}
              variant="secondary"
              onPress={() => setRecovery(!recovery)}
            />
            {recovery ? (
              <View style={ui.card}>
                <Text style={ui.heading}>Recover from a backup</Text>
                <Text style={ui.body}>
                  If your enrolled biometrics changed or the device key is unavailable, the current
                  tokens cannot be decrypted. Restore your encrypted Yhtua backup using its
                  password.
                </Text>
                <Notice danger>
                  Resetting deletes all tokens on this iPhone. Make sure your backup is available in
                  Files before continuing. After resetting, choose Restore a Yhtua backup on the
                  welcome screen.
                </Notice>
                <Button
                  title="Delete local vault to start recovery"
                  variant="danger"
                  busy={resetting}
                  onPress={() => void reset()}
                />
              </View>
            ) : null}
          </>
        ) : null}
      </Screen>
    )
  }

  return (
    <View style={ui.screen} onTouchStart={() => dispatch({ type: 'USER_ACTIVITY' })}>
      {__DEV__ && !isNativeVaultAvailable() ? (
        <View style={{ padding: 10, backgroundColor: colors.accentSubtle }}>
          <Text style={[ui.hint, { textAlign: 'center', color: colors.accent }]}>
            Development preview · synthetic tokens only
          </Text>
        </View>
      ) : null}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.base },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text, fontSize: 16 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.base },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="token/new" options={{ title: 'Add token' }} />
        <Stack.Screen name="token/scan" options={{ title: 'Scan QR code' }} />
        <Stack.Screen name="token/[id]" options={{ title: 'Token' }} />
        <Stack.Screen name="token/edit/[id]" options={{ title: 'Edit token' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/transfer" options={{ title: 'Backups' }} />
        <Stack.Screen name="dev/self-test" options={{ title: 'Vault self-test' }} />
      </Stack>
    </View>
  )
}
