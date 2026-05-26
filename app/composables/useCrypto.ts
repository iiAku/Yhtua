import { invoke } from '@tauri-apps/api/core'

// --- Tauri command wrappers ---

export const encryptWithPassword = (plaintext: string, password: string): Promise<string> =>
  invoke<string>('encrypt_with_password', { plaintext, password })

export const decryptWithPassword = (ciphertextBase64: string, password: string): Promise<string> =>
  invoke<string>('decrypt_with_password', { ciphertextBase64, password })

// --- Sync credentials (keychain-backed with encrypted file fallback) ---

export const storeSyncPassword = (password: string): Promise<void> =>
  invoke('store_sync_password', { password })

export const getSyncPassword = (): Promise<string> => invoke<string>('get_sync_password')

export const hasSyncPassword = (): Promise<boolean> => invoke<boolean>('has_sync_password')

export const deleteSyncPassword = (): Promise<void> => invoke('delete_sync_password')

export const storeSyncPath = (path: string): Promise<void> => invoke('store_sync_path', { path })

export const getSyncPath = (): Promise<string> => invoke<string>('get_sync_path')

export const hasSyncPath = (): Promise<boolean> => invoke<boolean>('has_sync_path')

export const deleteSyncPath = (): Promise<void> => invoke('delete_sync_path')

// --- Encryption key lifecycle (keychain-backed) ---

export const ensureEncryptionKey = (): Promise<boolean> => invoke<boolean>('ensure_encryption_key')

export const initializeEncryption = (): Promise<boolean> => ensureEncryptionKey()

export const isEncryptionReady = (): Promise<boolean> => invoke<boolean>('has_encryption_key')

export const hasEncryptionKey = (): Promise<boolean> => invoke<boolean>('has_encryption_key')

export const deleteEncryptionKey = (): Promise<void> => invoke('delete_encryption_key')

// --- Encrypt / decrypt using keychain-stored key ---

export const encryptSecret = (plaintext: string): Promise<string> =>
  invoke<string>('encrypt_with_keychain_key', { plaintext })

export const decryptSecret = (ciphertext: string): Promise<string> =>
  invoke<string>('decrypt_with_keychain_key', { ciphertextBase64: ciphertext })
