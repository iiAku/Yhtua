import type { CryptoPort } from '@yhtua/domain'
import { requireOptionalNativeModule } from 'expo-modules-core'

// Typed JS surface of the native vault. This file IS the audit artifact for
// what JavaScript can ask of the native layer: narrow operations, never the
// key. Anything wider must show up in this diff.

type YhtuaVaultNative = {
  vaultExists(): Promise<boolean>
  authenticateVault(): Promise<boolean>
  initializeVault(): Promise<boolean>
  encryptSecret(plaintext: string): Promise<string>
  decryptSecret(ciphertextBase64: string): Promise<string>
  decryptSecrets(ciphertextsBase64: string[]): Promise<string[]>
  exportYhp2(password: string, payload: string): Promise<string>
  importYhp2(password: string, envelopeBase64: string): Promise<string>
  destroyVault(): Promise<void>
  runSelfTest(fixtureJson: string): Promise<string>
}

const native = requireOptionalNativeModule<YhtuaVaultNative>('YhtuaVault')

export const isNativeVaultAvailable = (): boolean => native !== null

// ALL key-custody transactions are serialized: a reset racing an import, two
// initializations, or overlapping biometric fetches must never interleave.
let lifecycleChain: Promise<unknown> = Promise.resolve()
const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = lifecycleChain.then(operation, operation)
  lifecycleChain = next.catch(() => undefined)
  return next
}

/** A REAL biometric checkpoint (access-control-bound Keychain fetch); null
 * when the native module is absent (dev mock has no biometrics). */
export const authenticateVault = (): Promise<boolean> | null =>
  native ? native.authenticateVault() : null

/** Batch decryption under ONE biometric checkpoint (export flows). */
export const decryptSecretsBatch = (ciphertexts: string[]): Promise<string[]> | null =>
  native ? serialized(() => native.decryptSecrets(ciphertexts)) : null

/** Debug builds only; the native side refuses in release. */
export const runNativeSelfTest = (fixtureJson: string): Promise<string> => {
  if (!native) throw new Error('Native vault module is not installed in this build')
  return native.runSelfTest(fixtureJson)
}

export const nativeCryptoPort: CryptoPort | null = native
  ? {
      ensureEncryptionKey: () => serialized(() => native.initializeVault()),
      isEncryptionReady: () => native.vaultExists(),
      resetEncryptionKey: () =>
        serialized(async () => {
          await native.destroyVault()
          await native.initializeVault()
        }),
      encryptSecret: (plaintext) => serialized(() => native.encryptSecret(plaintext)),
      decryptSecret: (ciphertext) => serialized(() => native.decryptSecret(ciphertext)),
      encryptWithPassword: (plaintext, password) =>
        serialized(() => native.exportYhp2(password, plaintext)),
      decryptWithPassword: (ciphertextBase64, password) =>
        serialized(() => native.importYhp2(password, ciphertextBase64)),
    }
  : null
