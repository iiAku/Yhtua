import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { MAX_ENCRYPTED_BACKUP_BYTES } from './useStore'
import {
  decryptSecret,
  decryptWithPassword,
  encryptSecret,
  encryptWithPassword,
  initializeEncryption,
} from './useCrypto'

const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

// The envelope is unauthenticated metadata — only `data` is bound to the password
// by AEAD. So any file that merely looks encrypted earns a decryption attempt,
// and the strict validation that guards the store runs on the decrypted payload.
// Not .strict(): pre-2.7.1 backups carry a vestigial `hmac` key, and rejecting
// them outright sent an encrypted file to the plaintext parser, which then
// reported a nonsense error instead of asking for the password.
// Sync binds envelope metadata to the payload separately (useSync.ts) because it
// acts on `syncedAt`; a manual import reads nothing but `data`.
const encryptedEnvelopeSchema = z.object({
  version: z.string().max(32).optional(),
  encrypted: z.literal(true),
  syncedAt: timestampSchema.optional(),
  data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
})

const parseAndValidate = <T extends z.ZodType>(
  jsonString: string,
  schema: T,
  maxBytes?: number,
) => {
  try {
    const parsed = parseBoundedJson(jsonString, maxBytes)
    return schema.safeParse(parsed)
  } catch {
    return schema.safeParse(undefined)
  }
}

// Zod issues carry the field path and rule, never the value — safe to show.
const describeIssues = (error: z.ZodError | undefined): string => {
  const issue = error?.issues[0]
  if (!issue) return 'Invalid token file format'
  const field = issue.path.join('.')
  return field ? `Invalid backup: ${field} — ${issue.message}` : `Invalid backup: ${issue.message}`
}

// A rejected `invoke` yields the serialized Rust error as a plain string, not an
// Error — so `instanceof Error` alone silently swallowed every reason the OS gave
// us ("Encryption key is missing", "Secure credential storage is unavailable")
// and replaced it with a generic fallback.
const describeError = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

const pickBackupFile = (): Promise<string | null> => invoke<string | null>('pick_backup_file')

const saveBackupFile = (content: string): Promise<boolean> =>
  invoke<boolean>('save_backup_file', { content })

type EncryptedExport = z.infer<typeof encryptedEnvelopeSchema>

// Every import/export path returns one of these instead of notifying itself, so
// the page decides where feedback belongs — inline in the modal for failures the
// user can act on, a toast once the modal is gone.
export type BackupResult = {
  success: boolean
  cancelled?: boolean
  error?: string
  tokensCount?: number
  legacy?: boolean
  needsPassword?: boolean
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

    const encryptedResult = parseAndValidate(
      jsonContent,
      encryptedEnvelopeSchema,
      MAX_ENCRYPTED_BACKUP_BYTES,
    )

    if (encryptedResult.success) {
      let decryptedData: unknown
      try {
        // BOUNDARY: decryption is the password check — only failures here mean
        // the password was wrong, so nothing else belongs inside this catch.
        decryptedData = parseBoundedJson(
          await decryptWithPassword(encryptedResult.data.data, password),
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
    const legacyResult = parseAndValidate(jsonContent, plaintextBackupSchema)

    if (legacyResult.success) {
      const importedCount = await addImportedTokens(legacyResult.data.tokens)
      return { success: true, tokensCount: importedCount, legacy: true }
    }

    console.error('Import validation error:', legacyResult.error?.issues)
    return { success: false, error: describeIssues(legacyResult.error) }
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
    const encryptedResult = parseAndValidate(
      jsonContent,
      encryptedEnvelopeSchema,
      MAX_ENCRYPTED_BACKUP_BYTES,
    )
    if (encryptedResult.success) {
      pendingEncryptedBackup = encryptedResult.data
      return { success: false, needsPassword: true }
    }

    const result = parseAndValidate(jsonContent, plaintextBackupSchema)

    if (!result.success) {
      console.error('Import validation error:', result.error.issues)
      return { success: false, error: describeIssues(result.error) }
    }

    const importedCount = await addImportedTokens(result.data.tokens)
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
