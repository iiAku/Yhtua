import { invoke } from '@tauri-apps/api/core'
import {
  describeError,
  describeIssues,
  encryptedEnvelopeSchema,
  MAX_ENCRYPTED_BACKUP_BYTES,
  parseAndValidate,
  plaintextBackupSchema as domainPlaintextBackupSchema,
  type BackupResult,
  type EncryptedExport,
} from '@yhtua/domain'
import type { z } from 'zod'
import {
  decryptSecret,
  decryptWithPassword,
  encryptSecret,
  encryptWithPassword,
  initializeEncryption,
} from './useCrypto'

export type { BackupResult } from '@yhtua/domain'

const pickBackupFile = (): Promise<string | null> => invoke<string | null>('pick_backup_file')

const saveBackupFile = (content: string): Promise<boolean> =>
  invoke<boolean>('save_backup_file', { content })

// The single routing decision for any picked backup file. Exported so the
// conformance suite exercises the exact same code path the import flows use.
export type ImportClassification =
  | { kind: 'encrypted'; envelope: EncryptedExport }
  | { kind: 'plaintext'; backup: z.infer<typeof domainPlaintextBackupSchema> }
  | { kind: 'rejected'; error?: z.ZodError }

export const classifyImportJson = (jsonContent: string): ImportClassification => {
  const encryptedResult = parseAndValidate(
    jsonContent,
    encryptedEnvelopeSchema,
    MAX_ENCRYPTED_BACKUP_BYTES,
  )
  if (encryptedResult.success) return { kind: 'encrypted', envelope: encryptedResult.data }
  const plainResult = parseAndValidate(jsonContent, domainPlaintextBackupSchema)
  if (plainResult.success) return { kind: 'plaintext', backup: plainResult.data }
  return { kind: 'rejected', error: plainResult.error }
}

// Tokens arrive here already parsed into the current shape; this completes the
// conversion by encrypting each secret with the device key and stamping
// `updatedAt`, which legacy backups predate and sync merging relies on.
//
// No confirmation prompt: importing only ever adds (storeAddToken skips ids that
// already exist and never overwrites), so there is nothing to guard — and
// window.confirm is unreliable in a WebKitGTK webview, where a false return
// would abort the import with no visible reason at all.
const addImportedTokens = async (tokens: Token[]): Promise<number> => {
  await initializeEncryption()

  const now = Date.now()
  const converted = await Promise.all(
    tokens.map(async (token) => ({
      ...token,
      updatedAt: token.updatedAt ?? now,
      otp: {
        ...token.otp,
        secret: await encryptSecret(token.otp.secret),
        encrypted: true,
      },
    })),
  )

  return storeAddToken(converted)
}

let pendingEncryptedBackup: EncryptedExport | null = null

export const hasPendingEncryptedImport = (): boolean => pendingEncryptedBackup !== null

export const clearPendingEncryptedImport = (): void => {
  pendingEncryptedBackup = null
}

export const completePendingEncryptedImport = async (password: string): Promise<BackupResult> => {
  const pending = pendingEncryptedBackup
  if (!pending) return { success: false, error: 'No pending import' }

  let decryptedData: unknown
  try {
    const decryptedJson = await decryptWithPassword(pending.data, password)
    decryptedData = parseBoundedJson(decryptedJson)
  } catch {
    return { success: false, error: 'Wrong password or corrupted file' }
  }

  const validationResult = plaintextBackupSchema.safeParse(decryptedData)
  if (!validationResult.success) {
    return { success: false, error: describeIssues(validationResult.error) }
  }
  try {
    const importedCount = await addImportedTokens(validationResult.data.tokens)
    if (pendingEncryptedBackup === pending) pendingEncryptedBackup = null

    return { success: true, tokensCount: importedCount }
  } catch (error) {
    return {
      success: false,
      error: describeError(error, 'Encryption error'),
    }
  }
}

const getPlaintextSecret = async (token: Token): Promise<string> => {
  if (token.otp.encrypted) {
    return await decryptSecret(token.otp.secret)
  }
  return token.otp.secret
}

export const exportTokensEncrypted = async (password: string): Promise<BackupResult> => {
  try {
    const tokens = getTokens()
    const decryptedTokens = await Promise.all(
      tokens.map(async (token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await getPlaintextSecret(token),
          encrypted: false,
        },
      })),
    )

    const backupData = {
      version: '2.3.0',
      encrypted: false,
      tokens: decryptedTokens,
      tombstones: getTombstones(),
    }

    const encryptedData = await encryptWithPassword(JSON.stringify(backupData), password)

    const encryptedBackup = {
      version: '2.3.0',
      encrypted: true,
      data: encryptedData,
    }

    if (!(await saveBackupFile(JSON.stringify(encryptedBackup, null, 2)))) {
      return { success: false, cancelled: true }
    }
    return { success: true, tokensCount: tokens.length }
  } catch (error) {
    console.error('Export error:', error)
    return {
      success: false,
      error: describeError(error, 'Error while exporting tokens'),
    }
  }
}

export const importTokensEncrypted = async (password: string): Promise<BackupResult> => {
  try {
    const jsonContent = await pickBackupFile()
    if (jsonContent === null) {
      return { success: false, cancelled: true }
    }

    const classified = classifyImportJson(jsonContent)

    if (classified.kind === 'encrypted') {
      let decryptedData: unknown
      try {
        // BOUNDARY: decryption is the password check — only failures here mean
        // the password was wrong, so nothing else belongs inside this catch.
        decryptedData = parseBoundedJson(
          await decryptWithPassword(classified.envelope.data, password),
        )
      } catch {
        return { success: false, error: 'Wrong password or corrupted file' }
      }

      const validationResult = plaintextBackupSchema.safeParse(decryptedData)
      if (!validationResult.success) {
        return { success: false, error: describeIssues(validationResult.error) }
      }

      const importedCount = await addImportedTokens(validationResult.data.tokens)
      return { success: true, tokensCount: importedCount }
    }

    // Not encrypted — an unencrypted export from any supported release.
    if (classified.kind === 'plaintext') {
      const importedCount = await addImportedTokens(classified.backup.tokens)
      return { success: true, tokensCount: importedCount, legacy: true }
    }

    console.error('Import validation error:', classified.error?.issues)
    return { success: false, error: describeIssues(classified.error) }
  } catch (error) {
    console.error('Import error:', error)
    return {
      success: false,
      error: describeError(error, 'Error while importing tokens'),
    }
  }
}

export const importTokens = async (): Promise<BackupResult> => {
  try {
    const jsonContent = await pickBackupFile()
    if (jsonContent === null) {
      return { success: false, cancelled: true }
    }

    // Encrypted backup (manual export or sync file) — the caller collects the
    // password and finishes through completePendingEncryptedImport.
    const classified = classifyImportJson(jsonContent)
    if (classified.kind === 'encrypted') {
      pendingEncryptedBackup = classified.envelope
      return { success: false, needsPassword: true }
    }

    if (classified.kind === 'rejected') {
      console.error('Import validation error:', classified.error?.issues)
      return { success: false, error: describeIssues(classified.error) }
    }

    const importedCount = await addImportedTokens(classified.backup.tokens)
    return { success: true, tokensCount: importedCount }
  } catch (error) {
    console.error('Import error:', error)
    return {
      success: false,
      error: describeError(error, 'Error while importing tokens'),
    }
  }
}

export const removeAllTokens = async (notification: Ref<AppNotification>) => {
  try {
    storeDeleteAllTokens()
    await useShowNotification(notification, {
      text: 'All tokens removed',
      delay: 1500,
    })
  } catch {
    await useShowNotification(notification, {
      text: 'Error while removing tokens',
      delay: 1500,
      type: NotificationType.Danger,
    })
  }
}
