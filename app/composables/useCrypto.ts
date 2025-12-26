import { invoke } from '@tauri-apps/api/core'

export const generateEncryptionKey = (): Promise<string> =>
  invoke<string>('generate_encryption_key')

export const hasEncryptionKey = (): Promise<boolean> =>
  invoke<boolean>('has_encryption_key')

export const storeEncryptionKey = (keyBase64: string): Promise<void> =>
  invoke<void>('store_encryption_key', { keyBase64 })

export const getEncryptionKey = (): Promise<string> =>
  invoke<string>('get_encryption_key')

export const deleteEncryptionKey = (): Promise<void> =>
  invoke<void>('delete_encryption_key')

export const encryptWithKeychainKey = (plaintext: string): Promise<string> =>
  invoke<string>('encrypt_with_keychain_key', { plaintext })

export const decryptWithKeychainKey = (ciphertextBase64: string): Promise<string> =>
  invoke<string>('decrypt_with_keychain_key', { ciphertextBase64 })

export const encryptWithPassword = (plaintext: string, password: string): Promise<string> =>
  invoke<string>('encrypt_with_password', { plaintext, password })

export const decryptWithPassword = (ciphertextBase64: string, password: string): Promise<string> =>
  invoke<string>('decrypt_with_password', { ciphertextBase64, password })

export const storeSyncPassword = (password: string): Promise<void> =>
  invoke<void>('store_sync_password', { password })

export const getSyncPassword = (): Promise<string> =>
  invoke<string>('get_sync_password')

export const hasSyncPassword = (): Promise<boolean> =>
  invoke<boolean>('has_sync_password')

export const deleteSyncPassword = (): Promise<void> =>
  invoke<void>('delete_sync_password')

export const storeSyncPath = (path: string): Promise<void> =>
  invoke<void>('store_sync_path', { path })

export const getSyncPath = (): Promise<string> =>
  invoke<string>('get_sync_path')

export const hasSyncPath = (): Promise<boolean> =>
  invoke<boolean>('has_sync_path')

export const deleteSyncPath = (): Promise<void> =>
  invoke<void>('delete_sync_path')

export const initializeEncryption = async (): Promise<boolean> => {
  const exists = await hasEncryptionKey()
  if (!exists) {
    const key = await generateEncryptionKey()
    await storeEncryptionKey(key)
    const verified = await hasEncryptionKey()
    if (!verified) {
      throw new Error('Failed to store encryption key in keychain')
    }
    return true
  }
  return false
}

export const isEncryptionReady = (): Promise<boolean> =>
  hasEncryptionKey()

export const encryptSecret = (plaintext: string): Promise<string> =>
  encryptWithKeychainKey(plaintext)

export const decryptSecret = (ciphertext: string): Promise<string> =>
  decryptWithKeychainKey(ciphertext)
