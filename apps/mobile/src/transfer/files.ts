import { MAX_ENCRYPTED_BACKUP_BYTES } from '@yhtua/domain'
import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { exportBackupContent, importBackupContent } from './index'

/** The picker copies a provider's file into our cache. Never delete the original. */
export async function importBackupFile(password: string) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (picked.canceled || !picked.assets[0]) return null
  const file = new File(picked.assets[0].uri)
  try {
    // Providers sometimes label JSON as generic data; accept the file type,
    // then let the bounded shared backup parser validate its actual content.
    if ((file.size ?? 0) > MAX_ENCRYPTED_BACKUP_BYTES)
      throw new Error('Backup file exceeds the size limit')
    return await importBackupContent(await file.text(), password)
  } finally {
    try {
      file.delete()
    } catch {
      /* A provider may already have removed its cached copy. */
    }
  }
}

export async function shareBackupFile(password: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device')
  const content = await exportBackupContent(password)
  const file = new File(Paths.cache, `yhtua-backup-${Date.now()}.json`)
  try {
    file.write(content)
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save encrypted Yhtua backup',
    })
  } finally {
    try {
      file.delete()
    } catch {
      /* Do not replace a useful transfer error with a cleanup error. */
    }
  }
}
