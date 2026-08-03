import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { z } from 'zod'
import {
  decryptSecret,
  decryptWithSyncPassword,
  decryptWithPassword,
  deleteSyncPassword,
  deleteSyncPath,
  encryptSecret,
  encryptWithSyncPassword,
  encryptWithPassword,
  ensureEncryptionKey,
  getSyncPath,
  hasSyncPassword,
  hasSyncPath,
  storeSyncPassword,
  storeSyncPath,
} from './useCrypto'
import { mergeTokens } from './useMerge'
import {
  MAX_ENCRYPTED_BACKUP_BYTES,
  getTombstones,
  getTokens,
  portableBackupMetadataMatches,
  replaceAllTokens,
  setTombstones,
  storeAddToken,
  type Token,
  type Tombstone,
} from './useStore'

const SYNC_DEBOUNCE_MS = 3000
const FILE_WATCH_INTERVAL_MS = 10000
const SYNC_VERSION = '2.3.0'
const STATUS_CACHE_TTL_MS = 5000

let cachedStatus: SyncStatus | null = null
let statusCacheTime = 0
let isMerging = false
let fileOperationActive = false

export const getIsMerging = () => isMerging

const invalidateStatusCache = () => {
  cachedStatus = null
  statusCacheTime = 0
}

export enum SyncErrorCode {
  None = 'none',
  NotConfigured = 'not_configured',
  PathNotConfigured = 'path_not_configured',
  PasswordNotConfigured = 'password_not_configured',
  NoBackupFile = 'no_backup_file',
  InvalidFormat = 'invalid_format',
  WrongPassword = 'wrong_password',
  Unknown = 'unknown',
}

export interface SyncStatus {
  enabled: boolean
  syncPath: string | null
  hasPassword: boolean
  lastSync: number | null
  lastKnownFileVersion: number | null
  autoSync: boolean
  passwordMismatch: boolean
}

export interface SyncResult {
  success: boolean
  message: string
  errorCode?: SyncErrorCode
  tokensCount?: number
}

// Deliberately not .strict(): backups written before 2.7.1 carry a vestigial
// `hmac` field, and rejecting the whole file over a key we no longer read makes
// an existing remote backup permanently unreadable. Unknown keys are stripped,
// so a rewrite drops them. The fields we act on are still validated here and
// cross-checked against the authenticated payload by portableBackupMetadataMatches.
const syncBackupSchema = z.object({
  version: z.enum(['2.2.0', '2.3.0']),
  encrypted: z.literal(true),
  syncedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  data: z.string().min(1).max(MAX_ENCRYPTED_BACKUP_BYTES),
})

const SYNC_METADATA_KEY = 'yhtua_sync_metadata'

const syncMetadataSchema = z
  .object({
    lastSync: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    lastKnownFileVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    autoSync: z.boolean(),
    passwordMismatch: z.boolean().default(false),
  })
  .strict()

type SyncMetadata = z.infer<typeof syncMetadataSchema>

const getSyncMetadata = (): SyncMetadata => {
  try {
    const stored = localStorage.getItem(SYNC_METADATA_KEY)
    if (stored) {
      return syncMetadataSchema.parse(parseBoundedJson(stored, 4096, 4))
    }
  } catch (error) {
    console.warn('Failed to read sync metadata:', error)
  }
  return { lastSync: null, lastKnownFileVersion: null, autoSync: true, passwordMismatch: false }
}

const setSyncMetadata = (metadata: Partial<SyncMetadata>) =>
  localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify({ ...getSyncMetadata(), ...metadata }))

export const getSyncStatus = async (forceRefresh = false): Promise<SyncStatus> => {
  const now = Date.now()
  if (!forceRefresh && cachedStatus && now - statusCacheTime < STATUS_CACHE_TTL_MS) {
    return cachedStatus
  }

  const hasPath = await hasSyncPath()
  const hasPass = await hasSyncPassword()
  const metadata = getSyncMetadata()

  let syncPath: string | null = null
  if (hasPath) {
    try {
      syncPath = await getSyncPath()
    } catch (error) {
      console.warn('Failed to get sync path:', error)
    }
  }

  cachedStatus = {
    enabled: hasPath && hasPass,
    syncPath,
    hasPassword: hasPass,
    lastSync: metadata.lastSync,
    lastKnownFileVersion: metadata.lastKnownFileVersion,
    autoSync: metadata.autoSync,
    passwordMismatch: metadata.passwordMismatch ?? false,
  }
  statusCacheTime = now

  return cachedStatus
}

export const configureSyncPath = async (): Promise<string | null> => {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    title: 'Select Sync Folder',
  })

  if (selectedPath) {
    await storeSyncPath(selectedPath)
    invalidateStatusCache()
    return selectedPath
  }

  return null
}

export const configureSyncPassword = async (password: string): Promise<void> => {
  await storeSyncPassword(password)
  invalidateStatusCache()
}

export const clearSyncPassword = async (): Promise<void> => {
  await deleteSyncPassword()
  invalidateStatusCache()
}

export const changeSyncPassword = async (newPassword: string): Promise<SyncResult> => {
  if (fileOperationActive) {
    return { success: false, message: 'Another sync operation is already running' }
  }
  fileOperationActive = true
  try {
    const status = await getSyncStatus()
    if (!status.syncPath || !status.hasPassword) {
      return {
        success: false,
        message: 'Sync is not fully configured',
        errorCode: SyncErrorCode.NotConfigured,
      }
    }

    const previousContent = await readSyncBackup()
    if (previousContent === null) {
      await storeSyncPassword(newPassword)
      invalidateStatusCache()
      return { success: true, message: 'Sync password changed' }
    }

    const parsed = syncBackupSchema.parse(
      parseBoundedJson(previousContent, MAX_ENCRYPTED_BACKUP_BYTES),
    )
    const decryptedJson = await decryptWithSyncPassword(parsed.data)
    const decrypted = plaintextBackupSchema.parse(parseBoundedJson(decryptedJson))
    const syncedAt = Date.now()
    const encryptedData = await encryptWithPassword(
      JSON.stringify({ ...decrypted, version: SYNC_VERSION, syncedAt }),
      newPassword,
    )
    const nextContent = JSON.stringify(
      { ...parsed, version: SYNC_VERSION, syncedAt, data: encryptedData },
      null,
      2,
    )

    await writeSyncBackup(nextContent)
    try {
      await storeSyncPassword(newPassword)
    } catch (error) {
      // Restore the old-password file if the OS credential update did not commit.
      await writeSyncBackup(previousContent)
      throw error
    }

    setSyncMetadata({ lastSync: syncedAt, lastKnownFileVersion: syncedAt, passwordMismatch: false })
    invalidateStatusCache()
    return { success: true, message: 'Sync password changed' }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unable to change sync password',
      errorCode: SyncErrorCode.Unknown,
    }
  } finally {
    fileOperationActive = false
  }
}

export const setAutoSync = (enabled: boolean): void => setSyncMetadata({ autoSync: enabled })

const readSyncBackup = (): Promise<string | null> => invoke<string | null>('read_sync_backup')

const syncBackupExists = (): Promise<boolean> => invoke<boolean>('sync_backup_exists')

const writeSyncBackup = (content: string): Promise<void> => invoke('write_sync_backup', { content })

const getPlaintextSecret = async (token: Token): Promise<string> =>
  token.otp.encrypted ? decryptSecret(token.otp.secret) : token.otp.secret

type RemoteBackup = {
  tokens: Token[]
  tombstones: Tombstone[]
  syncedAt: number
}

type RemoteReadResult =
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: SyncErrorCode; message: string }
  | { kind: 'ok'; backup: RemoteBackup }

const readRemoteBackup = async (
  decrypt: (ciphertext: string) => Promise<string>,
): Promise<RemoteReadResult> => {
  let content: string | null
  try {
    content = await readSyncBackup()
  } catch (error) {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.Unknown,
      message: error instanceof Error ? error.message : 'Failed to read backup file',
    }
  }
  if (content === null) return { kind: 'missing' }

  let raw: unknown
  try {
    raw = parseBoundedJson(content, MAX_ENCRYPTED_BACKUP_BYTES)
  } catch {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.InvalidFormat,
      message: 'Backup file is not valid JSON',
    }
  }

  const parsed = syncBackupSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.InvalidFormat,
      message: 'Backup file format is invalid',
    }
  }

  let decryptedJson: string
  try {
    decryptedJson = await decrypt(parsed.data.data)
  } catch {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.WrongPassword,
      message: 'Wrong password or corrupted file',
    }
  }

  let decryptedData: unknown
  try {
    decryptedData = parseBoundedJson(decryptedJson)
  } catch {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.InvalidFormat,
      message: 'Decrypted backup is not valid JSON',
    }
  }

  const validationResult = plaintextBackupSchema.safeParse(decryptedData)
  if (
    !validationResult.success ||
    !portableBackupMetadataMatches(parsed.data, validationResult.data)
  ) {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.InvalidFormat,
      message: 'Backup data structure is invalid',
    }
  }

  return {
    kind: 'ok',
    backup: {
      tokens: validationResult.data.tokens,
      tombstones: validationResult.data.tombstones,
      syncedAt: parsed.data.syncedAt,
    },
  }
}

export const syncToFile = async (): Promise<SyncResult> => {
  if (fileOperationActive) {
    return { success: false, message: 'Another sync operation is already running' }
  }
  fileOperationActive = true
  try {
    const status = await getSyncStatus()

    if (!status.enabled) {
      return {
        success: false,
        message: 'Sync not configured',
        errorCode: SyncErrorCode.NotConfigured,
      }
    }

    if (getTokens().length === 0 && getTombstones().length === 0) {
      return {
        success: false,
        message: 'No tokens to sync',
        errorCode: SyncErrorCode.NotConfigured,
      }
    }

    await ensureEncryptionKey()

    // Read remote backup for merge. Abort if cloud file exists but is unreadable —
    // overwriting it would silently destroy whatever data is in it.
    const remote = await readRemoteBackup(decryptWithSyncPassword)
    if (remote.kind === 'unreadable') {
      return {
        success: false,
        message: `Refusing to overwrite remote backup: ${remote.message}`,
        errorCode: remote.reason,
      }
    }

    const localTokens = getTokens()
    const decryptedLocalTokens = await Promise.all(
      localTokens.map(async (token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await getPlaintextSecret(token),
          encrypted: false,
        },
      })),
    )

    const remoteTokens = remote.kind === 'ok' ? remote.backup.tokens : []
    const remoteTombstones = remote.kind === 'ok' ? remote.backup.tombstones : []

    const merged = mergeTokens({
      localTokens: decryptedLocalTokens,
      localTombstones: getTombstones(),
      remoteTokens,
      remoteTombstones,
    })

    const syncedAt = Date.now()

    const backupData = {
      version: SYNC_VERSION,
      encrypted: false,
      syncedAt,
      tokens: merged.tokens,
      tombstones: merged.tombstones,
    }

    const encryptedData = await encryptWithSyncPassword(JSON.stringify(backupData))

    const syncBackup = {
      version: SYNC_VERSION,
      encrypted: true,
      syncedAt,
      data: encryptedData,
    }

    // Rust writes a mandatory safety copy and atomically replaces the primary file.
    await writeSyncBackup(JSON.stringify(syncBackup, null, 2))

    // Re-encrypt merged tokens for local storage and update store
    const reEncryptedTokens = await Promise.all(
      merged.tokens.map(async (token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await encryptSecret(token.otp.secret),
          encrypted: true,
        },
      })),
    )

    isMerging = true
    replaceAllTokens(reEncryptedTokens)
    setTombstones(merged.tombstones)
    isMerging = false

    setSyncMetadata({ lastSync: syncedAt, lastKnownFileVersion: syncedAt, passwordMismatch: false })

    return {
      success: true,
      message: 'Synced successfully',
      tokensCount: merged.tokens.length,
    }
  } catch (error) {
    isMerging = false
    console.error('Sync to file failed:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Sync failed',
      errorCode: SyncErrorCode.Unknown,
    }
  } finally {
    fileOperationActive = false
  }
}

export const restoreFromFile = async (replaceExisting: boolean = true): Promise<SyncResult> => {
  if (fileOperationActive) {
    return { success: false, message: 'Another sync operation is already running' }
  }
  fileOperationActive = true
  try {
    const status = await getSyncStatus()

    if (!status.syncPath) {
      return {
        success: false,
        message: 'Sync path not configured',
        errorCode: SyncErrorCode.PathNotConfigured,
      }
    }

    if (!status.hasPassword) {
      return {
        success: false,
        message: 'Sync password not configured',
        errorCode: SyncErrorCode.PasswordNotConfigured,
      }
    }

    const remote = await readRemoteBackup(decryptWithSyncPassword)
    if (remote.kind === 'missing') {
      return {
        success: false,
        message: 'No backup file found',
        errorCode: SyncErrorCode.NoBackupFile,
      }
    }
    if (remote.kind === 'unreadable') {
      return { success: false, message: remote.message, errorCode: remote.reason }
    }

    await ensureEncryptionKey()

    if (replaceExisting) {
      // Merge local + remote tokens
      const localTokens = getTokens()
      const decryptedLocalTokens = await Promise.all(
        localTokens.map(async (token) => ({
          ...token,
          otp: {
            ...token.otp,
            secret: await getPlaintextSecret(token),
            encrypted: false,
          },
        })),
      )

      const merged = mergeTokens({
        localTokens: decryptedLocalTokens,
        localTombstones: getTombstones(),
        remoteTokens: remote.backup.tokens,
        remoteTombstones: remote.backup.tombstones,
      })

      const reEncryptedTokens = await Promise.all(
        merged.tokens.map(async (token: Token) => ({
          ...token,
          otp: {
            ...token.otp,
            secret: await encryptSecret(token.otp.secret),
            encrypted: true,
          },
        })),
      )

      isMerging = true
      replaceAllTokens(reEncryptedTokens)
      setTombstones(merged.tombstones)
      isMerging = false

      setSyncMetadata({ lastKnownFileVersion: remote.backup.syncedAt })

      return {
        success: true,
        message: 'Restored successfully',
        tokensCount: reEncryptedTokens.length,
      }
    }

    // Append mode (manual import) — no merge, just add
    const reEncryptedTokens = await Promise.all(
      remote.backup.tokens.map(async (token: Token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await encryptSecret(token.otp.secret),
          encrypted: true,
        },
      })),
    )

    const importedCount = storeAddToken(reEncryptedTokens)
    setSyncMetadata({ lastKnownFileVersion: remote.backup.syncedAt })

    return {
      success: true,
      message: 'Restored successfully',
      tokensCount: importedCount,
    }
  } catch (error) {
    isMerging = false
    console.error('Restore from file failed:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Restore failed',
      errorCode: SyncErrorCode.Unknown,
    }
  } finally {
    fileOperationActive = false
  }
}

export const hasBackupFile = async (): Promise<boolean> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) return false

    return await syncBackupExists()
  } catch (error) {
    console.warn('Failed to check backup file:', error)
    return false
  }
}

export const getBackupInfo = async (
  status?: SyncStatus,
): Promise<{
  exists: boolean
  syncedAt: number | null
  tokensCount: number | null
} | null> => {
  try {
    const syncStatus = status ?? (await getSyncStatus())
    if (!syncStatus.syncPath || !syncStatus.hasPassword) return null

    const fileExists = await syncBackupExists()

    if (!fileExists) {
      return { exists: false, syncedAt: null, tokensCount: null }
    }

    const content = await readSyncBackup()
    if (content === null) return { exists: false, syncedAt: null, tokensCount: null }
    const parsed = syncBackupSchema.safeParse(parseBoundedJson(content, MAX_ENCRYPTED_BACKUP_BYTES))

    if (!parsed.success) {
      return { exists: true, syncedAt: null, tokensCount: null }
    }

    try {
      const decryptedJson = await decryptWithSyncPassword(parsed.data.data)
      const decryptedData = plaintextBackupSchema.parse(parseBoundedJson(decryptedJson))

      if (!portableBackupMetadataMatches(parsed.data, decryptedData)) {
        return { exists: true, syncedAt: null, tokensCount: null }
      }

      return {
        exists: true,
        syncedAt: parsed.data.syncedAt,
        tokensCount: decryptedData.tokens?.length ?? null,
      }
    } catch (error) {
      console.warn('Failed to decrypt backup info:', error)
      return {
        exists: true,
        syncedAt: parsed.data.syncedAt,
        tokensCount: null,
      }
    }
  } catch (error) {
    console.warn('Failed to get backup info:', error)
    return null
  }
}

export const disableSync = async (): Promise<void> => {
  await deleteSyncPath()
  await deleteSyncPassword()
  localStorage.removeItem(SYNC_METADATA_KEY)
  invalidateStatusCache()
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null

export const triggerDebouncedSync = () => {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }

  syncTimeout = setTimeout(async () => {
    const status = await getSyncStatus()
    if (status.enabled && status.autoSync) {
      await syncToFile()
    }
  }, SYNC_DEBOUNCE_MS)
}

export const cancelPendingSync = () => {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
    syncTimeout = null
  }
}

let fileWatchInterval: ReturnType<typeof setInterval> | null = null
let isCheckingForUpdates = false

let passwordMismatchCallback: ((remoteVersion: number) => void) | null = null

export const onPasswordMismatch = (callback: ((remoteVersion: number) => void) | null) => {
  passwordMismatchCallback = callback
}

export const tryRestoreWithPassword = async (password: string): Promise<SyncResult> => {
  if (fileOperationActive) {
    return { success: false, message: 'Another sync operation is already running' }
  }
  fileOperationActive = true
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) {
      return { success: false, message: 'Sync path not configured' }
    }

    const remote = await readRemoteBackup((ciphertext) => decryptWithPassword(ciphertext, password))
    if (remote.kind === 'missing') {
      return { success: false, message: 'No backup file found' }
    }
    if (remote.kind === 'unreadable') {
      return { success: false, message: remote.message, errorCode: remote.reason }
    }

    await storeSyncPassword(password)
    await ensureEncryptionKey()

    // Merge local + remote tokens
    const localTokens = getTokens()
    const decryptedLocalTokens = await Promise.all(
      localTokens.map(async (token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await getPlaintextSecret(token),
          encrypted: false,
        },
      })),
    )

    const merged = mergeTokens({
      localTokens: decryptedLocalTokens,
      localTombstones: getTombstones(),
      remoteTokens: remote.backup.tokens,
      remoteTombstones: remote.backup.tombstones,
    })

    const reEncryptedTokens = await Promise.all(
      merged.tokens.map(async (token: Token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await encryptSecret(token.otp.secret),
          encrypted: true,
        },
      })),
    )

    isMerging = true
    replaceAllTokens(reEncryptedTokens)
    setTombstones(merged.tombstones)
    isMerging = false

    setSyncMetadata({ lastKnownFileVersion: remote.backup.syncedAt, passwordMismatch: false })

    return {
      success: true,
      message: 'Restored successfully with new password',
      tokensCount: reEncryptedTokens.length,
    }
  } catch (error) {
    isMerging = false
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Restore failed',
    }
  } finally {
    fileOperationActive = false
  }
}

const getFileSyncedAt = async (): Promise<number | null> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) return null

    const fileExists = await syncBackupExists()
    if (!fileExists) return null

    const content = await readSyncBackup()
    if (content === null) return null
    const parsed = syncBackupSchema.safeParse(parseBoundedJson(content, MAX_ENCRYPTED_BACKUP_BYTES))

    return parsed.success ? parsed.data.syncedAt : null
  } catch (error) {
    console.warn('Failed to get file synced at:', error)
    return null
  }
}

export const checkForRemoteUpdates = async (): Promise<{
  hasUpdates: boolean
  remoteVersion: number | null
  localVersion: number | null
}> => {
  const metadata = getSyncMetadata()
  const remoteVersion = await getFileSyncedAt()

  return {
    hasUpdates:
      remoteVersion !== null &&
      metadata.lastKnownFileVersion !== null &&
      remoteVersion > metadata.lastKnownFileVersion,
    remoteVersion,
    localVersion: metadata.lastKnownFileVersion,
  }
}

export const syncFromRemoteIfNeeded = async (): Promise<SyncResult | null> => {
  if (isCheckingForUpdates) return null
  isCheckingForUpdates = true

  try {
    const status = await getSyncStatus()
    if (!status.enabled || !status.autoSync) return null

    const { hasUpdates, remoteVersion } = await checkForRemoteUpdates()
    if (!hasUpdates) return null

    const result = await restoreFromFile(true)

    if (!result.success && result.errorCode === SyncErrorCode.WrongPassword) {
      setSyncMetadata({ passwordMismatch: true })
      if (passwordMismatchCallback && remoteVersion) {
        passwordMismatchCallback(remoteVersion)
      }
      stopFileWatcher()
    }

    return result
  } catch (error) {
    console.error('Failed to sync from remote:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Sync failed',
    }
  } finally {
    isCheckingForUpdates = false
  }
}

export const startFileWatcher = () => {
  if (fileWatchInterval) return

  fileWatchInterval = setInterval(async () => {
    await syncFromRemoteIfNeeded()
  }, FILE_WATCH_INTERVAL_MS)

  syncFromRemoteIfNeeded()
}

export const stopFileWatcher = () => {
  if (fileWatchInterval) {
    clearInterval(fileWatchInterval)
    fileWatchInterval = null
  }
}

export const initFileWatcher = async () => {
  const status = await getSyncStatus()
  if (status.enabled && status.autoSync) {
    startFileWatcher()
  }
}
