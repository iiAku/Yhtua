import { invoke } from '@tauri-apps/api/core'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

// --- Persisted crypto store (localStorage) ---

type CryptoStore = {
  encryptionKey: string | null
  syncPassword: string | null
  syncPath: string | null
}

type CryptoStoreActions = {
  setEncryptionKey: (key: string) => void
  clearEncryptionKey: () => void
  setSyncPassword: (password: string) => void
  clearSyncPassword: () => void
  setSyncPath: (path: string) => void
  clearSyncPath: () => void
  clearAll: () => void
}

const cryptoStore = createStore(
  persist<CryptoStore & CryptoStoreActions>(
    (set) => ({
      encryptionKey: null,
      syncPassword: null,
      syncPath: null,
      setEncryptionKey: (key: string) => set({ encryptionKey: key }),
      clearEncryptionKey: () => set({ encryptionKey: null }),
      setSyncPassword: (password: string) => set({ syncPassword: password }),
      clearSyncPassword: () => set({ syncPassword: null }),
      setSyncPath: (path: string) => set({ syncPath: path }),
      clearSyncPath: () => set({ syncPath: null }),
      clearAll: () => set({ encryptionKey: null, syncPassword: null, syncPath: null }),
    }),
    {
      name: 'yhtua-key',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        encryptionKey: state.encryptionKey,
        syncPassword: state.syncPassword,
        syncPath: state.syncPath,
      }),
    },
  ),
)

const getLocalKey = (): string | null => cryptoStore.getState().encryptionKey

const requireLocalKey = (): string => {
  const key = getLocalKey()
  if (!key) throw new Error('No encryption key found — please restart the app')
  return key
}

// --- Tauri command wrappers ---

export const generateEncryptionKey = (): Promise<string> =>
  invoke<string>('generate_encryption_key')

export const encryptWithPassword = (plaintext: string, password: string): Promise<string> =>
  invoke<string>('encrypt_with_password', { plaintext, password })

export const decryptWithPassword = (ciphertextBase64: string, password: string): Promise<string> =>
  invoke<string>('decrypt_with_password', { ciphertextBase64, password })

// --- Sync credentials (localStorage-backed, no keyring) ---

export const storeSyncPassword = (password: string): void =>
  cryptoStore.getState().setSyncPassword(password)

export const getSyncPassword = (): string => {
  const password = cryptoStore.getState().syncPassword
  if (!password) throw new Error('No sync password configured')
  return password
}

export const hasSyncPassword = (): boolean => cryptoStore.getState().syncPassword !== null

export const deleteSyncPassword = (): void => cryptoStore.getState().clearSyncPassword()

export const storeSyncPath = (path: string): void => cryptoStore.getState().setSyncPath(path)

export const getSyncPath = (): string => {
  const path = cryptoStore.getState().syncPath
  if (!path) throw new Error('No sync path configured')
  return path
}

export const hasSyncPath = (): boolean => cryptoStore.getState().syncPath !== null

export const deleteSyncPath = (): void => cryptoStore.getState().clearSyncPath()

// --- Encryption key lifecycle (localStorage-backed) ---

export const ensureEncryptionKey = async (): Promise<boolean> => {
  if (getLocalKey()) return false
  const key = await generateEncryptionKey()
  cryptoStore.getState().setEncryptionKey(key)
  return true
}

export const initializeEncryption = (): Promise<boolean> => ensureEncryptionKey()

export const isEncryptionReady = (): boolean => getLocalKey() !== null

export const hasEncryptionKey = (): boolean => getLocalKey() !== null

export const deleteEncryptionKey = (): void => cryptoStore.getState().clearEncryptionKey()

// --- Encrypt / decrypt using locally-stored key ---

export const encryptSecret = (plaintext: string): Promise<string> =>
  invoke<string>('encrypt_with_key', { plaintext, keyBase64: requireLocalKey() })

export const decryptSecret = (ciphertext: string): Promise<string> =>
  invoke<string>('decrypt_with_key', { ciphertextBase64: ciphertext, keyBase64: requireLocalKey() })

// --- Backup integrity (HMAC-SHA256) ---

export const signBackup = (data: string): Promise<string> =>
  invoke<string>('hmac_sha256', { data, keyBase64: requireLocalKey() })

export const verifyBackup = (data: string, mac: string): Promise<boolean> =>
  invoke<boolean>('verify_hmac_sha256', { data, keyBase64: requireLocalKey(), macBase64: mac })
