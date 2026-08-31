// Capability interfaces implemented by each platform adapter. The mobile
// client implements `CryptoPort` in its native module; the desktop Tauri
// client implements `DesktopCryptoPort` over its IPC commands. Domain code
// depends only on these shapes, never on an implementation.

/** SHA-256 (or platform-equivalent) digest of raw bytes. */
export type DigestFn = (data: Uint8Array) => Promise<Uint8Array>

/** Core vault crypto every client must provide. Secrets in, results out —
 * the encryption key itself never crosses this boundary. */
export interface CryptoPort {
  ensureEncryptionKey(): Promise<boolean>
  isEncryptionReady(): Promise<boolean>
  resetEncryptionKey(): Promise<void>
  encryptSecret(plaintext: string): Promise<string>
  decryptSecret(ciphertext: string): Promise<string>
  encryptWithPassword(plaintext: string, password: string): Promise<string>
  decryptWithPassword(ciphertextBase64: string, password: string): Promise<string>
}

/** Desktop adds OS-credential-store-backed sync credentials and a sync
 * directory. Mobile v1 deliberately has none of this. */
export interface DesktopCryptoPort extends CryptoPort {
  storeSyncPassword(password: string): Promise<void>
  encryptWithSyncPassword(plaintext: string): Promise<string>
  decryptWithSyncPassword(ciphertextBase64: string): Promise<string>
  hasSyncPassword(): Promise<boolean>
  deleteSyncPassword(): Promise<void>
  storeSyncPath(path: string): Promise<void>
  getSyncPath(): Promise<string>
  hasSyncPath(): Promise<boolean>
  deleteSyncPath(): Promise<void>
}

export interface ClipboardPort {
  read(): Promise<string>
  write(value: string): Promise<void>
}

/** Key-value persistence for the non-secret vault index. Matches zustand's
 * StateStorage shape so either client can hand it to a persist middleware. */
export interface StoragePort {
  getItem(name: string): string | null | Promise<string | null>
  setItem(name: string, value: string): void | Promise<void>
  removeItem(name: string): void | Promise<void>
}

/** Backup file selection and writing, however the platform provides it. */
export interface FilePort {
  pickBackupFile(): Promise<string | null>
  saveBackupFile(content: string): Promise<boolean>
}
