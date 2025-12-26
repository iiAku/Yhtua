import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { z } from 'zod'
import {
  decryptSecret,
  decryptWithPassword,
  deleteSyncPassword,
  deleteSyncPath,
  encryptSecret,
  encryptWithPassword,
  getSyncPassword,
  getSyncPath,
  hasSyncPassword,
  hasSyncPath,
  storeSyncPassword,
  storeSyncPath,
} from './useCrypto'
import { getTokens, replaceAllTokens, storeAddToken, type Token } from './useStore'

const BACKUP_FILENAME = 'yhtua_backup.json'
const SYNC_DEBOUNCE_MS = 3000
const FILE_WATCH_INTERVAL_MS = 10000

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
  } catch {}
  return { lastSync: null, lastKnownFileVersion: null, autoSync: true, passwordMismatch: false }
}

const setSyncMetadata = (metadata: Partial<SyncMetadata>) =>
  localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify({ ...getSyncMetadata(), ...metadata }))

export const getSyncStatus = async (): Promise<SyncStatus> => {
  const hasPath = await hasSyncPath()
  const hasPass = await hasSyncPassword()
  const metadata = getSyncMetadata()

  let syncPath: string | null = null
  if (hasPath) {
    try {
      syncPath = await getSyncPath()
    } catch {}
  }

  return {
    enabled: hasPath && hasPass,
    syncPath,
    hasPassword: hasPass,
    lastSync: metadata.lastSync,
    lastKnownFileVersion: metadata.lastKnownFileVersion,
    autoSync: metadata.autoSync,
    passwordMismatch: metadata.passwordMismatch ?? false,
  }
}

export const configureSyncPath = async (): Promise<string | null> => {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    title: 'Select Sync Folder',
  })

  if (selectedPath && typeof selectedPath === 'string') {
    await storeSyncPath(selectedPath)
    return selectedPath
  }

  return null
}

export const configureSyncPassword = (password: string): Promise<void> =>
  storeSyncPassword(password)

export const setAutoSync = (enabled: boolean): void => setSyncMetadata({ autoSync: enabled })

const getBackupFilePath = async (): Promise<string> => join(await getSyncPath(), BACKUP_FILENAME)

const getPlaintextSecret = async (token: Token): Promise<string> =>
  token.otp.encrypted ? decryptSecret(token.otp.secret) : token.otp.secret

export const syncToFile = async (): Promise<SyncResult> => {
  try {
    const status = await getSyncStatus()

    if (!status.enabled) {
      return { success: false, message: 'Sync not configured' }
    }

    const syncPath = await getSyncPath()
    const password = await getSyncPassword()
    const filePath = await getBackupFilePath()

    const dirExists = await exists(syncPath)
    if (!dirExists) {
      await mkdir(syncPath, { recursive: true })
    }

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
      version: '2.1.0',
      encrypted: false,
      tokens: decryptedTokens,
    }

    const encryptedData = await encryptWithPassword(JSON.stringify(backupData), password)

    const syncedAt = Date.now()
    const syncBackup = {
      version: '2.1.0',
      encrypted: true,
      syncedAt,
      data: encryptedData,
    }

    await writeTextFile(filePath, JSON.stringify(syncBackup, null, 2))

    setSyncMetadata({ lastSync: syncedAt, lastKnownFileVersion: syncedAt, passwordMismatch: false })

    return {
      success: true,
      message: 'Synced successfully',
      tokensCount: tokens.length,
    }
  } catch (error) {
    console.error('Sync to file failed:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Sync failed',
    }
  }
}

export const restoreFromFile = async (replaceExisting: boolean = true): Promise<SyncResult> => {
  try {
    const status = await getSyncStatus()

    if (!status.syncPath) {
      return { success: false, message: 'Sync path not configured' }
    }

    if (!status.hasPassword) {
      return { success: false, message: 'Sync password not configured' }
    }

    const password = await getSyncPassword()
    const filePath = await getBackupFilePath()

    const fileExists = await exists(filePath)
    if (!fileExists) {
      return { success: false, message: 'No backup file found' }
    }

    const content = await readTextFile(filePath)
    const parsed = syncBackupSchema.safeParse(JSON.parse(content))

    if (!parsed.success) {
      return { success: false, message: 'Invalid backup file format' }
    }

    let decryptedData: { tokens: Token[] }
    try {
      const decryptedJson = await decryptWithPassword(parsed.data.data, password)
      decryptedData = JSON.parse(decryptedJson)
    } catch {
      return { success: false, message: 'Wrong password or corrupted file' }
    }

    const reEncryptedTokens = await Promise.all(
      decryptedData.tokens.map(async (token: Token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await encryptSecret(token.otp.secret),
          encrypted: true,
        },
      })),
    )

    if (replaceExisting) {
      replaceAllTokens(reEncryptedTokens)
    } else {
      storeAddToken(reEncryptedTokens)
    }

    setSyncMetadata({ lastKnownFileVersion: parsed.data.syncedAt })

    return {
      success: true,
      message: 'Restored successfully',
      tokensCount: reEncryptedTokens.length,
    }
  } catch (error) {
    console.error('Restore from file failed:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Restore failed',
    }
  }
}

export const hasBackupFile = async (): Promise<boolean> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath) return false

    const filePath = await getBackupFilePath()
    return await exists(filePath)
  } catch {
    return false
  }
}

export const getBackupInfo = async (): Promise<{
  exists: boolean
  syncedAt: number | null
  tokensCount: number | null
} | null> => {
  try {
    const status = await getSyncStatus()
    if (!status.syncPath || !status.hasPassword) return null

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
      const password = await getSyncPassword()
      const decryptedJson = await decryptWithPassword(parsed.data.data, password)
      const decryptedData = JSON.parse(decryptedJson)

      return {
        exists: true,
        syncedAt: parsed.data.syncedAt,
        tokensCount: decryptedData.tokens?.length ?? null,
      }
    } catch {
      return {
        exists: true,
        syncedAt: parsed.data.syncedAt,
        tokensCount: null,
      }
    }
  } catch {
    return null
  }
}

export const disableSync = async (): Promise<void> => {
  try {
    await deleteSyncPath()
  } catch {}

  try {
    await deleteSyncPassword()
  } catch {}

  localStorage.removeItem(SYNC_METADATA_KEY)
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

    const filePath = await getBackupFilePath()
    const fileExists = await exists(filePath)
    if (!fileExists) {
      return { success: false, message: 'No backup file found' }
    }

    const content = await readTextFile(filePath)
    const parsed = syncBackupSchema.safeParse(JSON.parse(content))

    if (!parsed.success) {
      return { success: false, message: 'Invalid backup file format' }
    }

    let decryptedData: { tokens: Token[] }
    try {
      const decryptedJson = await decryptWithPassword(parsed.data.data, password)
      decryptedData = JSON.parse(decryptedJson)
    } catch {
      return { success: false, message: 'Wrong password' }
    }

    await storeSyncPassword(password)

    const reEncryptedTokens = await Promise.all(
      decryptedData.tokens.map(async (token: Token) => ({
        ...token,
        otp: {
          ...token.otp,
          secret: await encryptSecret(token.otp.secret),
          encrypted: true,
        },
      })),
    )

    replaceAllTokens(reEncryptedTokens)
    setSyncMetadata({ lastKnownFileVersion: parsed.data.syncedAt, passwordMismatch: false })

    return {
      success: true,
      message: 'Restored successfully with new password',
      tokensCount: reEncryptedTokens.length,
    }
  } catch (error) {
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
  } catch {
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

    if (!result.success && result.message === 'Wrong password or corrupted file') {
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
