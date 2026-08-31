import { MAX_ENCRYPTED_BACKUP_BYTES } from '@yhtua/domain'
import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { exportBackupContent, importBackupContent } from '../../transfer'

// YHP2 backup transfer — the ONLY desktop<->mobile migration path. The
// screens are thin adapters over src/transfer (node-tested policy); the file
// system and share sheet are the native parts, verified on a dev build per
// the release checklist.

export default function TransferScreen() {
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const runImport = async () => {
    setStatus(null)
    if (password.length < 8) {
      setStatus('Enter the backup password (at least 8 characters)')
      return
    }
    setBusy(true)
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      })
      const asset = picked.assets?.[0]
      if (picked.canceled || !asset) {
        setStatus('Import canceled')
        return
      }
      const file = new File(asset.uri)
      if ((file.size ?? 0) > MAX_ENCRYPTED_BACKUP_BYTES) {
        setStatus('Backup file exceeds the size limit')
        return
      }
      const content = await file.text()
      const result = await importBackupContent(content, password)
      setStatus(
        result.success
          ? `Imported ${result.tokensCount} token(s)`
          : (result.error ?? 'Import failed'),
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  const runExport = async () => {
    setStatus(null)
    if (password.length < 8) {
      setStatus('Choose a backup password (at least 8 characters)')
      return
    }
    setBusy(true)
    let file: File | null = null
    try {
      const content = await exportBackupContent(password)
      file = new File(Paths.cache, `yhtua-backup-${Date.now()}.json`)
      file.write(content)
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' })
      setStatus('Backup shared')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed')
    } finally {
      // The envelope is password-encrypted, but a cache file still has no
      // business outliving the share sheet.
      try {
        file?.delete()
      } catch {}
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.text}>
        Encrypted YHP2 backups are the only way to move tokens between devices. The password never
        leaves this device; the file is safe to store anywhere.
      </Text>
      <Text style={styles.fieldLabel}>Backup password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        placeholderTextColor="#55524A"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <View style={styles.row}>
        <Pressable
          style={[styles.primary, busy && styles.disabled]}
          onPress={() => void runExport()}
          disabled={busy}
        >
          <Text style={styles.primaryText}>Export backup</Text>
        </Pressable>
        <Pressable
          style={[styles.secondary, busy && styles.disabled]}
          onPress={() => void runImport()}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>Import backup</Text>
        </Pressable>
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { padding: 16, gap: 10 },
  text: { color: '#8A8578', fontSize: 13, lineHeight: 18 },
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
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#D4AF55',
  },
  primaryText: { color: '#0B0B0F', fontWeight: '600' },
  secondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#23232B',
  },
  secondaryText: { color: '#8A8578', fontWeight: '500' },
  disabled: { opacity: 0.6 },
  status: { color: '#E8E4D8', fontSize: 13, marginTop: 10 },
})
