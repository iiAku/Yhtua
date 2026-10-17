import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { dispatch } from '../../lock/host'
import { getCryptoPort } from '../../ports'
import { destroyVaultStorage, useVault } from '../../state/vault-store'
import { Button, Notice, Screen } from '../../ui/components'
import { Icon } from '../../ui/icon'
import { colors, ui } from '../../ui/theme'

export default function Settings() {
  const count = useVault((state) => state.tokens.length)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const destroyVault = async () => {
    setBusy(true)
    setError(null)
    try {
      await destroyVaultStorage()
      try {
        await getCryptoPort().resetEncryptionKey()
      } catch {
        /* No ciphertext remains. */
      }
      dispatch({ type: 'VAULT_DESTROYED' })
      router.replace('/')
    } catch {
      setError('Could not clear the vault. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen>
      <Text style={ui.eyebrow}>MAKE YOURSELF AT HOME</Text>
      <Text style={ui.title}>Settings</Text>
      <View style={ui.card}>
        <View style={ui.row}>
          <Icon name="shield" color={colors.accent} />
          <Text style={ui.heading}>Your vault</Text>
        </View>
        <Text style={ui.body}>
          {count} {count === 1 ? 'token' : 'tokens'}, encrypted on this iPhone.
        </Text>
        <Text style={ui.hint}>
          Your vault locks when you leave the app and after 5 minutes without activity. Unlocking
          uses your enrolled biometrics.
        </Text>
        <Button
          title="Lock vault now"
          variant="secondary"
          icon="lock"
          disabled={count === 0}
          onPress={() => dispatch({ type: 'MANUAL_LOCK' })}
        />
      </View>
      <View style={ui.card}>
        <View style={ui.row}>
          <Icon name="cloud" color={colors.accent} />
          <Text style={ui.heading}>Backups & recovery</Text>
        </View>
        <Text style={ui.body}>
          Keep an encrypted copy in iCloud Drive, Google Drive, or kDrive. Use the same backup
          format as Yhtua on desktop.
        </Text>
        <Button
          title="Manage backups"
          icon="chevron"
          variant="secondary"
          onPress={() => router.push('/settings/transfer')}
        />
        <Text style={ui.hint}>
          Changing your enrolled biometrics can invalidate the vault key. Save a backup before
          changing Face ID or Touch ID.
        </Text>
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>Private by design</Text>
        <Text style={ui.body}>
          No Yhtua account, analytics, or hosted sync service. Copied codes stay on this device and
          expire after 30 seconds.
        </Text>
        <Text style={ui.hint}>Yhtua {Constants.expoConfig?.version ?? '0.1.0'} · Open source</Text>
        {__DEV__ ? (
          <Button
            title="Vault self-test"
            variant="secondary"
            onPress={() => router.push('/dev/self-test')}
          />
        ) : null}
      </View>
      <View style={[ui.card, { borderColor: 'rgba(239,68,68,0.18)' }]}>
        <Text style={[ui.heading, { color: colors.danger }]}>Delete local vault</Text>
        <Text style={ui.body}>
          Removes all tokens from this iPhone. Your saved backup files are kept.
        </Text>
        {confirming ? (
          <>
            <Notice danger>
              Make sure you have a working backup or another way to sign in. This cannot be undone.
            </Notice>
            <Button
              title="Delete all local tokens"
              variant="danger"
              busy={busy}
              onPress={() => void destroyVault()}
            />
            <Button
              title="Keep my vault"
              variant="secondary"
              disabled={busy}
              onPress={() => setConfirming(false)}
            />
          </>
        ) : (
          <Button
            title="Delete local vault…"
            variant="danger"
            onPress={() => setConfirming(true)}
          />
        )}
        {error ? <Notice danger>{error}</Notice> : null}
      </View>
    </Screen>
  )
}
