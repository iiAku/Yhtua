import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { z } from 'zod'
import {
  decryptSecret,
  decryptWithPassword,
  deleteSyncPassword,
  deleteSyncPath,
  encryptSecret,
  encryptWithPassword,
  ensureEncryptionKey,
  getSyncPassword,
  getSyncPath,
  hasSyncPassword,
  hasSyncPath,
  signBackup,
  storeSyncPassword,
  storeSyncPath,
  verifyBackup,
} from './useCrypto'
import { mergeTokens } from './useMerge'
import {
  exportImportSchema,
  getTombstones,
  getTokens,
  replaceAllTokens,
  setTombstones,
  storeAddToken,
  type Token,
  type Tombstone,
} from './useStore'

const BACKUP_FILENAME = 'yhtua_backup.json'
const BACKUP_SAFETY_PREFIX = 'yhtua_backup.'
const BACKUP_SAFETY_SUFFIX = '.bak.json'
const BACKUP_SAFETY_KEEP = 5
const SYNC_DEBOUNCE_MS = 3000
const FILE_WATCH_INTERVAL_MS = 10000
const SYNC_VERSION = '2.2.0'
const STATUS_CACHE_TTL_MS = 5000

let cachedStatus: SyncStatus | null = null
let statusCacheTime = 0
let isMerging = false

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
  IntegrityCheckFailed = 'integrity_check_failed',
  RemoteUnreadable = 'remote_unreadable',
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

const syncBackupSchema = z.object({
  version: z.string(),
  encrypted: z.literal(true),
  syncedAt: z.number(),
  data: z.string(),
})

const SYNC_METADATA_KEY = 'yhtua_sync_metadata'

interface SyncMetadata {
  lastSync: number | null
  lastKnownFileVersion: number | null
  autoSync: boolean
  passwordMismatch: boolean
}

const getSyncMetadata = (): SyncMetadata => {
  try {
    const stored = localStorage.getItem(SYNC_METADATA_KEY)
    if (stored) {
      return JSON.parse(stored)
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

  const hasPath = hasSyncPath()
  const hasPass = hasSyncPassword()
  const metadata = getSyncMetadata()

  let syncPath: string | null = null
  if (hasPath) {
    try {
      syncPath = getSyncPath()
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
    storeSyncPath(selectedPath)
    invalidateStatusCache()
    return selectedPath
  }

  return null
}

export const configureSyncPassword = (password: string): void => {
  storeSyncPassword(password)
  invalidateStatusCache()
}

export const setAutoSync = (enabled: boolean): void => setSyncMetadata({ autoSync: enabled })

const getBackupFilePath = async (): Promise<string> => join(getSyncPath(), BACKUP_FILENAME)

const getPlaintextSecret = async (token: Token): Promise<string> =>
  token.otp.encrypted ? decryptSecret(token.otp.secret) : token.otp.secret

type RemoteBackup = {
  tokens: Token[]
  tombstones: Tombstone[]
  syncedAt: number
  rawContent: string
}

type RemoteReadResult =
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: SyncErrorCode; message: string }
  | { kind: 'ok'; backup: RemoteBackup }

const readRemoteBackup = async (password: string): Promise<RemoteReadResult> => {
  const filePath = await getBackupFilePath()
  const fileExists = await exists(filePath)
  if (!fileExists) return { kind: 'missing' }

  let content: string
  try {
    content = await readTextFile(filePath)
  } catch (error) {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.Unknown,
      message: error instanceof Error ? error.message : 'Failed to read backup file',
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(content)
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

  const hmac = (raw as { hmac?: unknown }).hmac
  if (typeof hmac === 'string' && hmac.length > 0) {
    try {
      const valid = await verifyBackup(parsed.data.data, hmac)
      if (!valid) {
        return {
          kind: 'unreadable',
          reason: SyncErrorCode.IntegrityCheckFailed,
          message: 'Backup integrity check failed — file may be corrupted or tampered',
        }
      }
    } catch {
      // HMAC verification unavailable (e.g. no local encryption key yet) — skip,
      // fall through to password decryption which will still detect tampering.
    }
  }

  let decryptedJson: string
  try {
    decryptedJson = await decryptWithPassword(parsed.data.data, password)
  } catch {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.WrongPassword,
      message: 'Wrong password or corrupted file',
    }
  }

  let decryptedData: unknown
  try {
    decryptedData = JSON.parse(decryptedJson)
  } catch {
    return {
      kind: 'unreadable',
      reason: SyncErrorCode.InvalidFormat,
      message: 'Decrypted backup is not valid JSON',
    }
  }

  const validationResult = exportImportSchema.safeParse(decryptedData)
  if (!validationResult.success) {
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
      rawContent: content,
    },
  }
}

const writeSafetyBackup = async (syncPath: string, content: string): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safetyPath = await join(
    syncPath,
    `${BACKUP_SAFETY_PREFIX}${timestamp}${BACKUP_SAFETY_SUFFIX}`,
  )
  await writeTextFile(safetyPath, content)
}

const pruneSafetyBackups = async (syncPath: string): Promise<void> => {
  try {
    const entries = await readDir(syncPath)
    const safetyFiles = entries
      .filter(
        (entry) =>
          !entry.isDirectory &&
          entry.name.startsWith(BACKUP_SAFETY_PREFIX) &&
          entry.name.endsWith(BACKUP_SAFETY_SUFFIX),
      )
      .map((entry) => entry.name)
      .sort()

    const stale = safetyFiles.slice(0, Math.max(0, safetyFiles.length - BACKUP_SAFETY_KEEP))
    for (const name of stale) {
      try {
        const path = await join(syncPath, name)
        await remove(path)
      } catch (error) {
        console.warn(`Failed to prune safety backup ${name}:`, error)
      }
    }
  } catch (error) {
    console.warn('Failed to enumerate safety backups for pruning:', error)
  }
}

export const syncToFile = async (): Promise<SyncResult> => {
  try {
    const status = await getSyncStatus()

    if (!status.enabled) {
      return {
        success: false,
        message: 'Sync not configured',
        errorCode: SyncErrorCode.NotConfigured,
      }
    }

    if (getTokens().length === 0) {
      return {
        success: false,
        message: 'No tokens to sync',
        errorCode: SyncErrorCode.NotConfigured,
      }
    }

    await ensureEncryptionKey()

    const syncPath = getSyncPath()
    const password = getSyncPassword()
    const filePath = await getBackupFilePath()

    const dirExists = await exists(syncPath)
    if (!dirExists) {
      await mkdir(syncPath, { recursive: true })
    }

    // Read remote backup for merge. Abort if cloud file exists but is unreadable —
    // overwriting it would silently destroy whatever data is in it.
    const remote = await readRemoteBackup(password)
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

    const backupData = {
      version: SYNC_VERSION,
      encrypted: false,
      tokens: merged.tokens,
      tombstones: merged.tombstones,
    }

    const encryptedData = await encryptWithPassword(JSON.stringify(backupData), password)

    const syncedAt = Date.now()
    let hmac: string | undefined
    try {
      hmac = await signBackup(encryptedData)
    } catch {}

    const syncBackup = {
      version: SYNC_VERSION,
      encrypted: true,
      syncedAt,
      data: encryptedData,
      ...(hmac && { hmac }),
    }

    // Write a safety copy of the existing remote before overwriting, so a bad
    // merge or schema bug never destroys the previous good state.
    if (remote.kind === 'ok') {
      try {
        await writeSafetyBackup(syncPath, remote.backup.rawContent)
        await pruneSafetyBackups(syncPath)
      } catch (error) {
        console.warn('Failed to write safety backup:', error)
      }
    }

    await writeTextFile(filePath, JSON.stringify(syncBackup, null, 2))

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
  }
}

export const restoreFromFile = async (replaceExisting: boolean = true): Promise<SyncResult> => {
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

    const password = getSyncPassword()

    const remote = await readRemoteBackup(password)
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

    storeAddToken(reEncryptedTokens)
    setSyncMetadata({ lastKnownFileVersion: remote.backup.syncedAt })

    return {
      success: true,
      message: 'Restored successfully',
      tokensCount: reEncryptedTokens.length,
    }
  } catch (error) {
    isMerging = false
    console.error('Restore from file failed:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Restore failed',
      errorCode: SyncErrorCode.Unknown,
    }
  }
}

export const hasBackupFile = async (): Promise<boolean> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) return false

    const filePath = await getBackupFilePath()
    return await exists(filePath)
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

    const filePath = await getBackupFilePath()
    const fileExists = await exists(filePath)

    if (!fileExists) {
      return { exists: false, syncedAt: null, tokensCount: null }
    }

    const content = await readTextFile(filePath)
    const parsed = syncBackupSchema.safeParse(JSON.parse(content))

    if (!parsed.success) {
      return { exists: true, syncedAt: null, tokensCount: null }
    }

    try {
      const password = getSyncPassword()
      const decryptedJson = await decryptWithPassword(parsed.data.data, password)
      const decryptedData = JSON.parse(decryptedJson)

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

export const disableSync = (): void => {
  deleteSyncPath()
  deleteSyncPassword()
  localStorage.removeItem(SYNC_METADATA_KEY)
  invalidateStatusCache()
}

let syncTimeout: NodeJS.Timeout | null = null

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

let fileWatchInterval: NodeJS.Timeout | null = null
let isCheckingForUpdates = false

let passwordMismatchCallback: ((remoteVersion: number) => void) | null = null

export const onPasswordMismatch = (callback: ((remoteVersion: number) => void) | null) => {
  passwordMismatchCallback = callback
}

export const tryRestoreWithPassword = async (password: string): Promise<SyncResult> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) {
      return { success: false, message: 'Sync path not configured' }
    }

    const remote = await readRemoteBackup(password)
    if (remote.kind === 'missing') {
      return { success: false, message: 'No backup file found' }
    }
    if (remote.kind === 'unreadable') {
      return { success: false, message: remote.message, errorCode: remote.reason }
    }

    storeSyncPassword(password)
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
  }
}

const getFileSyncedAt = async (): Promise<number | null> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) return null

    const filePath = await getBackupFilePath()
    const fileExists = await exists(filePath)
    if (!fileExists) return null

    const content = await readTextFile(filePath)
    const parsed = syncBackupSchema.safeParse(JSON.parse(content))

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
