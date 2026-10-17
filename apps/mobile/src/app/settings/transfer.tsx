import { useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { getLockState } from '../../lock/host'
import { useVault } from '../../state/vault-store'
import { importBackupFile, shareBackupFile } from '../../transfer/files'
import { Button, Field, Notice, Screen } from '../../ui/components'
import { Icon } from '../../ui/icon'
import { colors, ui } from '../../ui/theme'

export default function TransferScreen() {
  const count = useVault((state) => state.tokens.length)
  const [mode, setMode] = useState<'import' | 'export'>(
    getLockState() === 'uninitialized' ? 'import' : 'export',
  )
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const transfer = async () => {
    if (inFlight.current) return
    setStatus(null)
    if (password.length < 8) {
      setStatus({ text: 'Enter a backup password with at least 8 characters.', error: true })
      return
    }
    if (mode === 'export' && password !== confirmation) {
      setStatus({ text: 'The passwords do not match.', error: true })
      return
    }
    inFlight.current = true
    setBusy(true)
    try {
      if (mode === 'import') {
        const result = await importBackupFile(password)
        setStatus(
          result === null
            ? { text: 'No file selected. Your vault is unchanged.' }
            : result.success
              ? {
                  text: `Backup imported: ${result.tokensCount ?? 0} ${result.tokensCount === 1 ? 'token' : 'tokens'} processed. Your accounts are ready in the vault.`,
                }
              : { text: result.error ?? 'Import failed. Your vault is unchanged.', error: true },
        )
      } else {
        await shareBackupFile(password)
        setStatus({
          text: 'The share sheet has closed. Check your chosen destination to make sure the backup was saved.',
        })
      }
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'Transfer failed. Please try again.',
        error: true,
      })
    } finally {
      inFlight.current = false
      setBusy(false)
      setPassword('')
      setConfirmation('')
    }
  }
  return (
    <Screen>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 17,
          backgroundColor: colors.accentSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="cloud" color={colors.accent} size={28} />
      </View>
      <Text style={ui.eyebrow}>ENCRYPTED BACKUPS</Text>
      <Text style={ui.title}>A copy, just in case.</Text>
      <Text style={ui.body}>
        Move your tokens between Yhtua on desktop and iPhone, or keep a recovery copy in your cloud
        drive.
      </Text>
      <View
        accessibilityRole="tablist"
        style={[ui.row, { gap: 6, padding: 5, borderRadius: 14, backgroundColor: colors.surface }]}
      >
        {(['export', 'import'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value, disabled: busy }}
            disabled={busy}
            onPress={() => {
              setMode(value)
              setPassword('')
              setConfirmation('')
              setStatus(null)
            }}
            style={{
              flex: 1,
              minHeight: 46,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: mode === value ? colors.elevated : 'transparent',
            }}
          >
            <Text
              style={{
                color: mode === value ? colors.accent : colors.secondary,
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              {value === 'export' ? 'Save a backup' : 'Import a backup'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>
          {mode === 'export' ? 'Protect your recovery copy' : 'Bring your tokens home'}
        </Text>
        <Text style={ui.body}>
          {mode === 'export'
            ? `${count} ${count === 1 ? 'token' : 'tokens'} will be protected with a separate password. Keep it somewhere safe: Yhtua cannot recover it.`
            : 'Choose an encrypted Yhtua .json backup from Files. Existing tokens are merged with the backup.'}
        </Text>
        <Field
          label={mode === 'export' ? 'Create a backup password' : 'Backup password'}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          autoCapitalize="none"
          secureTextEntry
          editable={!busy}
          textContentType="none"
          maxLength={1024}
        />
        {mode === 'export' ? (
          <Field
            label="Confirm backup password"
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder="Enter the same password again"
            autoCapitalize="none"
            secureTextEntry
            editable={!busy}
            textContentType="none"
            maxLength={1024}
          />
        ) : null}
        <Button
          title={
            busy ? 'Working…' : mode === 'export' ? 'Choose where to save' : 'Choose a backup file'
          }
          icon={mode === 'export' ? 'upload' : 'download'}
          busy={busy}
          onPress={() => void transfer()}
        />
      </View>
      {status ? <Notice danger={status.error}>{status.text}</Notice> : null}
      <View style={ui.card}>
        <View style={ui.row}>
          <Icon name="cloud" color={colors.accent} />
          <Text style={ui.heading}>Your cloud, your choice</Text>
        </View>
        <Text style={ui.body}>
          Use iCloud Drive, Google Drive, or kDrive through the iPhone Files app. Install your
          provider’s app and enable it under Files → Browse → More → Edit.
        </Text>
        <Text style={ui.hint}>
          {mode === 'export'
            ? 'In the share sheet, choose Save to Files, then a folder in your drive. Other destinations depend on the apps installed on your phone.'
            : 'In the file picker, tap Browse to see your enabled drives. Download the backup first if your provider is offline.'}
        </Text>
        <Text style={ui.hint}>
          Transfers are manual. Save a new backup after changing your tokens, then import it on your
          other device.
        </Text>
      </View>
      <Text style={ui.hint}>
        Your cloud provider receives a password-encrypted file. Your device’s vault key stays on
        this iPhone.
      </Text>
    </Screen>
  )
}
